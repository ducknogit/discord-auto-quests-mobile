import { DiscordClient } from '../discordClient';
import { ProgressEvent, Quest } from '../models';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHeartbeatTask(
  client: DiscordClient,
  quest: Quest,
  emit: (ev: ProgressEvent) => void,
): Promise<void> {
  // Run heartbeats until Discord confirms completion; avoid premature "done" at ~97%.
  const target = quest.target || 600;
  const appId = quest.applicationId || quest.id;
  let progress = quest.progress ?? 0;

  // Allow a few extra terminal beats beyond the target.
  const maxBeats = Math.ceil(target / 60) + 5;

  for (let beat = 0; beat < maxBeats; beat++) {
    const terminal = progress + 60 >= target;
    const res = await client.postHeartbeat(quest.id, appId, terminal);

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

  // If server never marks complete, surface failure so it can be retried.
  throw new Error('Heartbeat task did not complete');
}
