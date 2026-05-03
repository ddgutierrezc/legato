const LegatoModule = {
  setup: jest.fn(async () => undefined),
  add: jest.fn(async (options: unknown) => ({ snapshot: { state: 'idle', queue: { tracks: [options], currentIndex: null } } })),
  remove: jest.fn(async (options: unknown) => ({ snapshot: { state: 'idle', queue: { tracks: [], currentIndex: null, removed: options } } })),
  reset: jest.fn(async () => ({ snapshot: { state: 'idle', queue: { tracks: [], currentIndex: null } } })),
  skipTo: jest.fn(async (options: { index: number }) => ({ snapshot: { state: 'playing', queue: { tracks: [], currentIndex: options.index } } })),
  play: jest.fn(async () => undefined),
  pause: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  getQueue: jest.fn(async () => ({ tracks: [], currentIndex: null })),
  getState: jest.fn(async () => ({ state: 'idle' })),
  getSnapshot: jest.fn(async () => ({ snapshot: { state: 'idle', queue: { tracks: [], currentIndex: null } } })),
  getCapabilities: jest.fn(async () => ({ supported: [] as string[] })),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  removeAllListeners: jest.fn(async () => undefined),
};

export default LegatoModule;
