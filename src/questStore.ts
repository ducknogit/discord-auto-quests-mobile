import pLimit from 'p-limit';
import EventEmitter from 'eventemitter3';
import { DiscordClient } from './discordClient';
import { Quest, TaskType, ProgressEvent, QuestStatus } from './models';
import { runVideoTask } from './tasks/video';
import { runHeartbeatTask } from './tasks/heartbeat';

export type QuestStoreOptions = {
  maxParallel?: number;
};

type EventMap = {
  progress: [ProgressEvent];
  status: [ProgressEvent];
  log: [ProgressEvent];
  balance: [ProgressEvent];
};

export class QuestStore extends EventEmitter<EventMap> {
  private client: DiscordClient;
  private quests: Quest[] = [];
  private limit: (fn: () => Promise<void>) => Promise<void>;

  constructor(client: DiscordClient, opts: QuestStoreOptions = {}) {
    super();
    this.client = client;
    this.limit = pLimit(opts.maxParallel || 2);
    this.client.on('rateLimit', (ms) => this.emit('log', { type: 'log', level: 'warn', message: `Rate limit, wait ${ms}ms` }));
    this.client.on('error', (err) => this.emit('log', { type: 'log', level: 'error', message: err.message }));
  }

  async load() {
    this.quests = await this.client.getQuests();
    return this.quests;
  }

  pending() {
    const now = Date.now();
    return this.quests.filter((q) => !q.completedAt && (!q.expiresAt || new Date(q.expiresAt).getTime() > now));
  }

  all() {
    return this.quests;
  }

  claimable() {
    return this.quests.filter((q) => q.completedAt && !q.claimedAt);
  }

  async claimAll() {
    for (const q of this.claimable()) {
      await this.client.claimReward(q.id);
      q.claimedAt = new Date().toISOString();
      this.emit('status', { type: 'status', questId: q.id, status: 'claimed' });
    }
  }

  async runPending() {
    const pending = this.pending();
    const tasks = pending.map((quest) =>
      this.limit(async () => {
        this.emit('status', { type: 'status', questId: quest.id, status: 'running' });
        try {
          await this.execute(quest);
          this.emit('status', { type: 'status', questId: quest.id, status: 'done' });
        } catch (err: any) {
          this.emit('log', { type: 'log', level: 'error', questId: quest.id, message: err?.message || 'Error' });
          this.emit('status', { type: 'status', questId: quest.id, status: 'failed' });
        }
      }),
    );
    await Promise.all(tasks);
    await this.claimAll();
  }

  private async execute(quest: Quest) {
    // enroll if needed
    if (!quest.enrolledAt) {
      try {
        const res = await this.client.enroll(quest.id);
        quest.enrolledAt = res?.enrolled_at || new Date().toISOString();
      } catch (err: any) {
        this.emit('log', { type: 'log', questId: quest.id, level: 'error', message: 'Enroll failed' });
      }
    }

    switch (quest.taskType) {
      case TaskType.WATCH_VIDEO:
      case TaskType.WATCH_VIDEO_ON_MOBILE:
        return runVideoTask(this.client, quest, (ev) => this.emit(ev.type as any, ev));
      case TaskType.PLAY_ON_DESKTOP:
      case TaskType.STREAM_ON_DESKTOP:
      case TaskType.PLAY_ACTIVITY:
        return runHeartbeatTask(this.client, quest, (ev) => this.emit(ev.type as any, ev));
      default:
        this.emit('log', { type: 'log', questId: quest.id, level: 'warn', message: 'Unsupported task type' });
        this.emit('status', { type: 'status', questId: quest.id, status: 'skipped' as QuestStatus });
    }
  }
}
