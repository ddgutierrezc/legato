import {
  LEGATO_EVENT_NAMES,
  type BindingAdapter,
  type LegatoEventName,
  type LegatoEventPayloadMap,
  type PlaybackSnapshot,
  type PlaybackState,
} from '@ddgutierrezc/legato-contract';
import LegatoModule, { type LegatoSnapshotResult, type LegatoStateResult } from './LegatoModule';

export const canonicalEventNames = [...LEGATO_EVENT_NAMES];

function unwrapSnapshotResult(result: LegatoSnapshotResult): PlaybackSnapshot {
  if (typeof result === 'object' && result !== null && 'snapshot' in result) {
    return result.snapshot;
  }

  return result;
}

function unwrapStateResult(result: LegatoStateResult): PlaybackState {
  if (typeof result === 'object' && result !== null && 'state' in result) {
    return result.state;
  }

  return result;
}

export function createLegatoWrapper(): Pick<
  BindingAdapter,
  | 'setup'
  | 'add'
  | 'remove'
  | 'reset'
  | 'skipTo'
  | 'play'
  | 'pause'
  | 'stop'
  | 'getQueue'
  | 'getState'
  | 'getSnapshot'
  | 'getCapabilities'
  | 'addListener'
  | 'removeAllListeners'
> {
  return {
    async setup(options) {
      await LegatoModule.setup(options);
    },
    async add(options) {
      return unwrapSnapshotResult(await LegatoModule.add(options));
    },
    async remove(options) {
      return unwrapSnapshotResult(await LegatoModule.remove(options));
    },
    async reset() {
      return unwrapSnapshotResult(await LegatoModule.reset());
    },
    async skipTo(options) {
      return unwrapSnapshotResult(await LegatoModule.skipTo(options));
    },
    async play() {
      await LegatoModule.play();
    },
    async pause() {
      await LegatoModule.pause();
    },
    async stop() {
      await LegatoModule.stop();
    },
    async getQueue() {
      return await LegatoModule.getQueue();
    },
    async getState() {
      return unwrapStateResult(await LegatoModule.getState());
    },
    async getSnapshot() {
      return unwrapSnapshotResult(await LegatoModule.getSnapshot());
    },
    async getCapabilities() {
      const result = await LegatoModule.getCapabilities();
      return {
        supported: Array.isArray(result?.supported) ? [...result.supported] : [],
      };
    },
    async addListener<E extends LegatoEventName>(
      eventName: E,
      listener: (payload: LegatoEventPayloadMap[E]) => void,
    ) {
      const handle = LegatoModule.addListener(eventName, listener);
      return {
        remove: async () => handle.remove(),
      };
    },
    removeAllListeners() {
      return LegatoModule.removeAllListeners();
    },
  };
}
