import { DiscordClient } from '../discordClient';
import { ProgressEvent, Quest } from '../models';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHeartbeatTask(
  client: DiscordClient,
  quest: Quest,
  emit: (ev: ProgressEvent) => void,
): Promise<void> {
  const target = quest.target || 60 * 10;
  let progress = quest.progress ?? 0;
  const appId = quest.applicationId || quest.id;

  while (progress < target) {
    const terminal = progress + 60 >= target;
    const res = await client.postHeartbeat(quest.id, appId, terminal);
    progress = Math.min(target, progress + 60);
    emit({ type: 'progress', questId: quest.id, progress, remaining: Math.max(0, target - progress) });
    if (res.completed || progress >= target) break;
    await sleep(60_000);
  }

  quest.completedAt = new Date().toISOString();
}
