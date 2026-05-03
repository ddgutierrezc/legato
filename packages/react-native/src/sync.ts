import type {
  BindingAdapter,
  LegatoEventName,
  LegatoEventPayloadMap,
  PlaybackSnapshot,
} from '@ddgutierrezc/legato-contract';
import { LEGATO_EVENTS } from './events';
import { createLegatoWrapper } from './legato-wrapper';

type SyncClient = Pick<BindingAdapter, 'addListener' | 'getSnapshot'>;

export interface LegatoSyncOptions {
  client?: SyncClient;
  onSnapshot?: (snapshot: PlaybackSnapshot) => void;
  onEvent?: <E extends LegatoEventName>(eventName: E, payload: LegatoEventPayloadMap[E]) => void;
}

export interface LegatoSyncController {
  start(): Promise<PlaybackSnapshot>;
  resync(): Promise<PlaybackSnapshot>;
  getCurrent(): PlaybackSnapshot | null;
  stop(): Promise<void>;
}

export function createLegatoSync(options: LegatoSyncOptions = {}): LegatoSyncController {
  const client = options.client ?? createLegatoWrapper();
  const handles: Array<{ remove: () => Promise<void> | void }> = [];
  let current: PlaybackSnapshot | null = null;

  const publish = (snapshot: PlaybackSnapshot): PlaybackSnapshot => {
    current = snapshot;
    options.onSnapshot?.(snapshot);
    return snapshot;
  };

  const subscribe = async () => {
    await Promise.all(
      LEGATO_EVENTS.map(async (eventName) => {
        const handle = await client.addListener(eventName, (payload) => {
          const typedPayload = payload as LegatoEventPayloadMap[typeof eventName];
          options.onEvent?.(eventName, typedPayload);
        });
        handles.push(handle);
      }),
    );
  };

  return {
    async start() {
      const snapshot = await this.resync();
      await subscribe();
      return snapshot;
    },
    async resync() {
      const snapshot = await client.getSnapshot();
      return publish(snapshot);
    },
    getCurrent() {
      return current;
    },
    async stop() {
      await Promise.all(handles.splice(0).map((handle) => handle.remove()));
    },
  };
}
