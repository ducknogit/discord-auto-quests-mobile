import EventEmitter from 'eventemitter3';
import { DiscordClient } from './discordClient';
import { QuestStore } from './questStore';
import { ProgressEvent, Quest } from './models';

export type RunnerOptions = {
  token: string;
  maxParallel?: number;
};

type EventMap = {
  progress: [ProgressEvent];
  status: [ProgressEvent];
  log: [ProgressEvent];
  balance: [ProgressEvent];
};

export class Runner extends EventEmitter<EventMap> {
  private client: DiscordClient;
  private store: QuestStore;

  constructor(opts: RunnerOptions) {
    super();
    this.client = new DiscordClient({ token: opts.token });
    this.store = new QuestStore(this.client, { maxParallel: opts.maxParallel });
    this.store.on('progress', (ev) => this.emit('progress', ev));
    this.store.on('status', (ev) => this.emit('status', ev));
    this.store.on('log', (ev) => this.emit('log', ev));
  }

  async init() {
    await this.store.load();
    await this.store.claimAll();
  }

  quests(): Quest[] {
    return this.store.all();
  }

  async run() {
    await this.store.runPending();
    const balance = await this.client.getBalance().catch(() => null);
    if (balance !== null) this.emit('balance', { type: 'balance', orbs: balance });
  }

  pending() {
    return this.store.pending();
  }
}
