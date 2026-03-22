import { DiscordClient } from '../discordClient';
import { ProgressEvent, Quest } from '../models';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runVideoTask(
  client: DiscordClient,
  quest: Quest,
  emit: (ev: ProgressEvent) => void,
): Promise<void> {
  const target = quest.target;
  let progress = quest.progress ?? 0;
  const enrolled = quest.enrolledAt ? new Date(quest.enrolledAt).getTime() : Date.now();

  // Keep pushing progress until the server returns completed; do not mark complete locally.
  const maxTicks = target + 30; // generous cap to avoid infinite loop

  for (let tick = 0; tick < maxTicks; tick++) {
    const maxAllowed = Math.floor((Date.now() - enrolled) / 1000) + 10;
    const diff = maxAllowed - progress;
    const step = Math.min(diff, 7);

    if (step > 0) {
      progress = Math.min(target, progress + step);
      const res = await client.postVideoProgress(quest.id, progress + Math.random());
      if (res.completed) {
        quest.completedAt = new Date().toISOString();
        emit({ type: 'progress', questId: quest.id, progress: target, remaining: 0 });
        return;
      }
      emit({ type: 'progress', questId: quest.id, progress, remaining: Math.max(0, target - progress) });
    }

    // After reaching target, keep pinging a few times to let backend finalize.
    if (progress >= target) {
      const res = await client.postVideoProgress(quest.id, target + Math.random());
      if (res.completed) {
        quest.completedAt = new Date().toISOString();
        emit({ type: 'progress', questId: quest.id, progress: target, remaining: 0 });
        return;
      }
    }

    await sleep(1000);
  }

  throw new Error('Video task did not complete');
}
