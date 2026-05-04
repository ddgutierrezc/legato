import { NativeModule, requireNativeModule } from 'expo';
import type {
  AddOptions,
  BindingCapabilitiesSnapshot,
  LegatoEventName,
  LegatoEventPayloadMap,
  PlaybackSnapshot,
  PlaybackState,
  QueueSnapshot,
  RemoveOptions,
  SeekToOptions,
  SetupOptions,
  SkipToOptions,
  Track,
} from '@ddgutierrezc/legato-contract';

export type LegatoCapabilities = {
  supported: BindingCapabilitiesSnapshot['supported'];
};

export type LegatoStateResult = { state: PlaybackState } | PlaybackState;
export type LegatoSnapshotResult = { snapshot: PlaybackSnapshot } | PlaybackSnapshot;

declare class LegatoModule extends NativeModule {
  setup(options?: SetupOptions): Promise<void>;
  getCapabilities(): Promise<LegatoCapabilities>;
  add(options: AddOptions): Promise<LegatoSnapshotResult>;
  remove(options: RemoveOptions): Promise<LegatoSnapshotResult>;
  reset(): Promise<LegatoSnapshotResult>;
  seekTo(options: SeekToOptions): Promise<void>;
  skipTo(options: SkipToOptions): Promise<LegatoSnapshotResult>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  getPosition(): Promise<number>;
  getDuration(): Promise<number | null>;
  getCurrentTrack(): Promise<Track | null>;
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
