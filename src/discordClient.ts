import EventEmitter from 'eventemitter3';
import { randomUUID } from 'expo-crypto';
import { TaskType, Quest } from './models';

export type DiscordClientOptions = {
  token: string;
  userAgent?: string;
};

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: any;
  retries?: number;
};

// Platform mapping used by current Discord quests API (int32 enum).
// Observed: desktop quests reject android codes. We brute-force in claimReward.
const platformPayload = (platform: 'android' | 'desktop' = 'desktop') =>
  platform === 'desktop' ? 1 : 2;

const CLIENT_PROPS = {
  os: 'Windows',
  browser: 'Discord Client',
  release_channel: 'stable',
  client_version: '1.0.9215',
  os_version: '10.0.19045',
  os_arch: 'x64',
  app_arch: 'x64',
  system_locale: 'en-US',
  has_client_mods: false,
  client_launch_id: randomUUID(),
  browser_user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9215 Chrome/138.0.7204.251 Electron/37.6.0 Safari/537.36',
  browser_version: '37.6.0',
  os_sdk_version: '19045',
  client_build_number: 471091,
  native_build_number: 72186,
  client_event_source: null,
  launch_signature: randomUUID(),
  client_heartbeat_session_id: randomUUID(),
  client_app_state: 'focused',
};

export class DiscordClient extends EventEmitter<{
  rateLimit: (retryAfter: number) => void;
  error: (err: Error) => void;
}> {
  private token: string;
  private userAgent: string;

  constructor(opts: DiscordClientOptions) {
    super();
    this.token = opts.token;
    this.userAgent =
      opts.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9215 Chrome/138.0.7204.251 Electron/37.6.0 Safari/537.36';
  }

  private headers() {
    return {
      Authorization: this.token,
      'User-Agent': this.userAgent,
      'X-Discord-Locale': 'en-US',
      'Accept-Language': 'en-US',
      'X-Super-Properties': btoa(JSON.stringify(CLIENT_PROPS)),
      'X-Discord-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC',
      'Content-Type': 'application/json',
      Origin: 'https://discord.com',
      Referer: 'https://discord.com/channels/@me',
    };
  }

  private async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const url = `https://discord.com/api/v10${path}`;
    const { method = 'GET', body, retries = 3 } = opts;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = (data.retry_after || 1) * 1000;
      this.emit('rateLimit', retryAfter);
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, retryAfter));
        return this.request(path, { method, body, retries: retries - 1 });
      }
      throw new Error('Rate limited');
    }

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`HTTP ${res.status} ${path}: ${text}`);
      this.emit('error', err);
      throw err;
    }

    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async getQuests(): Promise<Quest[]> {
    const data = await this.request<any>('/quests/@me');
    const quests: Quest[] = (data.quests || []).map((q: any) => {
      const tasks = q.config?.task_config?.tasks || {};
      const taskType =
        [
          TaskType.WATCH_VIDEO,
          TaskType.WATCH_VIDEO_ON_MOBILE,
          TaskType.PLAY_ON_DESKTOP,
          TaskType.STREAM_ON_DESKTOP,
          TaskType.PLAY_ACTIVITY,
        ].find((t) => tasks[t]) || null;

      const target = taskType ? tasks[taskType]?.target ?? 900 : 900;
      const progress =
        (taskType && q.user_status?.progress?.[taskType]?.value != null
          ? q.user_status.progress[taskType].value
          : 0) || 0;

      return {
        id: q.id,
        name: q.config?.messages?.quest_name?.trim() || q.id,
        expiresAt: q.config?.expires_at,
        taskType,
        target,
        progress,
        applicationId: q.config?.application?.id ?? null,
        enrolledAt: q.user_status?.enrolled_at,
        claimedAt: q.user_status?.claimed_at,
        completedAt: q.user_status?.completed_at,
        reward: {
          orbQuantity: q.config?.rewards_config?.rewards?.[0]?.orb_quantity,
          name: q.config?.rewards_config?.rewards?.[0]?.messages?.name,
        },
      } as Quest;
    });
    return quests;
  }

  async claimReward(questId: string, platform: 'android' | 'desktop' = 'desktop'): Promise<void> {
    // Brute-force platform/location combos until one succeeds.
    const platforms: Array<'android' | 'desktop'> = platform === 'desktop' ? ['desktop', 'android'] : ['android', 'desktop'];
    const locations = [11, 1];
    let lastError: any;
    for (const plat of platforms) {
      for (const loc of locations) {
        try {
          await this.request(`/quests/${questId}/claim-reward`, {
            method: 'POST',
            body: { platform: platformPayload(plat), location: loc },
          });
          return;
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || '';
          if (!msg.includes('platform') && !msg.includes('260004')) throw err;
        }
      }
    }
    throw lastError;
  }

  async postVideoProgress(questId: string, timestamp: number): Promise<{ completed: boolean }> {
    const res = await this.request<any>(`/quests/${questId}/video-progress`, {
      method: 'POST',
      body: { timestamp, platform: platformPayload('android'), location: 11 },
    });
    return { completed: !!res?.completed_at };
  }

  async enroll(questId: string) {
    const res = await this.request<any>(`/quests/${questId}/enroll`, {
      method: 'POST',
      body: { location: 11, is_targeted: false, metadata_raw: null, platform: platformPayload('android') },
    });
    return res;
  }

  async postHeartbeat(
    questId: string,
    applicationId?: string,
    terminal = false,
    platform: 'android' | 'desktop' = 'android',
  ): Promise<{ completed: boolean }> {
    const res = await this.request<any>(`/quests/${questId}/heartbeat`, {
      method: 'POST',
      body: { application_id: applicationId, terminal, platform: platformPayload(platform), location: 11 },
    });
    return { completed: !!res?.completed_at };
  }

  async getBalance(): Promise<number> {
    const res = await this.request<any>('/users/@me/virtual-currency/balance');
    return res?.balance ?? 0;
  }
}
