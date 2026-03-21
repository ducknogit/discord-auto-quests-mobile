export enum TaskType {
  WATCH_VIDEO = 'WATCH_VIDEO',
  WATCH_VIDEO_ON_MOBILE = 'WATCH_VIDEO_ON_MOBILE',
  PLAY_ON_DESKTOP = 'PLAY_ON_DESKTOP',
  STREAM_ON_DESKTOP = 'STREAM_ON_DESKTOP',
  PLAY_ACTIVITY = 'PLAY_ACTIVITY',
}

export type QuestReward = {
  orbQuantity?: number;
  name?: string;
};

export type Quest = {
  id: string;
  name: string;
  expiresAt?: string;
  taskType: TaskType | null;
  target: number;
  progress: number;
  applicationId?: string | null;
  enrolledAt?: string | null;
  claimedAt?: string | null;
  completedAt?: string | null;
  reward: QuestReward;
};

export type QuestStatus = 'pending' | 'running' | 'done' | 'claimed' | 'failed' | 'skipped';

export type ProgressEvent =
  | { type: 'progress'; questId: string; progress: number; remaining: number }
  | { type: 'status'; questId: string; status: QuestStatus }
  | { type: 'log'; questId?: string; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'balance'; orbs: number };
