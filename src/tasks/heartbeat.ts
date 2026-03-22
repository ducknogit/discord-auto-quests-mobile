import { DiscordClient } from '../discordClient';
import { ProgressEvent, Quest } from '../models';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHeartbeatTask(
  client: DiscordClient,
  quest: Quest,
  emit: (ev: ProgressEvent) => void,
): Promise<void> {
  const target = quest.target || 600;
  let progress = quest.progress ?? 0;
  const appId = quest.applicationId || quest.id;
  const platform: 'android' | 'desktop' =
    quest.taskType === 'PLAY_ON_DESKTOP' || quest.taskType === 'STREAM_ON_DESKTOP' || quest.taskType === 'PLAY_ACTIVITY'
      ? 'desktop'
      : 'android';

  // Allow extra beats past nominal target to avoid stopping at ~97%.
  const maxBeats = Math.ceil(target / 60) + 5;

  for (let beat = 0; beat < maxBeats; beat++) {
    const terminal = progress + 60 >= target;
    const res = await client.postHeartbeat(quest.id, appId, terminal, platform);

    if (res.completed) {
      quest.completedAt = new Date().toISOString();
      emit({ type: 'progress', questId: quest.id, progress: target, remaining: 0 });
      return;
    }

    progress = Math.min(target, progress + 60);
    emit({
      type: 'progress',
      questId: quest.id,
      progress,
      remaining: Math.max(0, target - progress),
    });

    await sleep(60_000);
  }

  throw new Error('Heartbeat task did not complete');
}
