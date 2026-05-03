import { NativeModule, requireNativeModule } from 'expo';
import type {
  BindingCapabilitiesSnapshot,
  LegatoEventName,
  LegatoEventPayloadMap,
  PlaybackSnapshot,
  PlaybackState,
  QueueSnapshot,
} from '@ddgutierrezc/legato-contract';

export type LegatoCapabilities = {
  supported: BindingCapabilitiesSnapshot['supported'];
};

export type LegatoStateResult = { state: PlaybackState } | PlaybackState;
export type LegatoSnapshotResult = { snapshot: PlaybackSnapshot } | PlaybackSnapshot;

declare class LegatoModule extends NativeModule {
  setup(options?: { headerGroups?: unknown[] }): Promise<void>;
  getCapabilities(): Promise<LegatoCapabilities>;
  add(options: { tracks: unknown[]; startIndex?: number }): Promise<LegatoSnapshotResult>;
  remove(options: { id?: string; index?: number }): Promise<LegatoSnapshotResult>;
  reset(): Promise<LegatoSnapshotResult>;
  skipTo(options: { index: number }): Promise<LegatoSnapshotResult>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  getQueue(): Promise<QueueSnapshot>;
  getState(): Promise<LegatoStateResult>;
  getSnapshot(): Promise<LegatoSnapshotResult>;
  addListener<E extends LegatoEventName>(
    eventName: E,
    listener: (payload: LegatoEventPayloadMap[E]) => void,
  ): { remove: () => void };
  removeAllListeners(): Promise<void>;
}

export default requireNativeModule<LegatoModule>('Legato');
