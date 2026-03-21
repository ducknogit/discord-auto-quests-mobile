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

  while (progress < target) {
    const maxAllowed = Math.floor((Date.now() - enrolled) / 1000) + 10;
    const diff = maxAllowed - progress;
    const step = Math.min(diff, 7);
    if (step > 0) {
      progress = Math.min(target, progress + step);
      await client.postVideoProgress(quest.id, progress + Math.random());
      emit({ type: 'progress', questId: quest.id, progress, remaining: Math.max(0, target - progress) });
    }
    if (progress >= target) break;
    await sleep(1000);
  }
  quest.completedAt = new Date().toISOString();
}
