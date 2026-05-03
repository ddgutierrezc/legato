import { LEGATO_EVENT_NAMES } from '@ddgutierrezc/legato-contract';
jest.mock('../LegatoModule', () => require('../../mocks/LegatoModule'));

import LegatoModule from '../LegatoModule';
import { canonicalEventNames, createLegatoWrapper } from '../legato-wrapper';

describe('legato Expo wrapper contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps setup() to the Expo module setup bridge', async () => {
    const wrapper = createLegatoWrapper();
    await wrapper.setup({ headerGroups: [] });
    expect(LegatoModule.setup).toHaveBeenCalledWith({ headerGroups: [] });
  });

  it('returns queue snapshots for mutating calls', async () => {
    const wrapper = createLegatoWrapper();
    const addSnapshot = await wrapper.add({ tracks: [] });
    const removeSnapshot = await wrapper.remove({ index: 0 });
    const resetSnapshot = await wrapper.reset();
    const skipSnapshot = await wrapper.skipTo({ index: 2 });

    expect(LegatoModule.add).toHaveBeenCalled();
    expect(LegatoModule.remove).toHaveBeenCalled();
    expect(LegatoModule.reset).toHaveBeenCalled();
    expect(LegatoModule.skipTo).toHaveBeenCalledWith({ index: 2 });
    expect(addSnapshot).toHaveProperty('queue');
    expect(removeSnapshot).toHaveProperty('queue');
    expect(resetSnapshot).toHaveProperty('queue');
    expect(skipSnapshot).toHaveProperty('queue');
  });

  it('keeps event names aligned to LEGATO_EVENT_NAMES', () => {
    expect(canonicalEventNames).toEqual([...LEGATO_EVENT_NAMES]);
  });

  it('projects capabilities with stable supported arrays', async () => {
    const wrapper = createLegatoWrapper();
    const capabilities = await wrapper.getCapabilities();
    expect(Array.isArray(capabilities.supported)).toBe(true);
  });

  it('maps minimal transport controls to Expo module bridge', async () => {
    const wrapper = createLegatoWrapper();

    await wrapper.play();
    await wrapper.pause();
    await wrapper.stop();

    expect(LegatoModule.play).toHaveBeenCalledTimes(1);
    expect(LegatoModule.pause).toHaveBeenCalledTimes(1);
    expect(LegatoModule.stop).toHaveBeenCalledTimes(1);
  });

  it('normalizes state/snapshot retrieval plus listener handles', async () => {
    const wrapper = createLegatoWrapper();
    const listener = jest.fn();

    LegatoModule.getState.mockResolvedValueOnce({ state: 'playing' });
    LegatoModule.getSnapshot.mockResolvedValueOnce({
      snapshot: {
        state: 'playing',
        queue: { tracks: [], currentIndex: null },
      },
    });

    const state = await wrapper.getState();
    const snapshot = await wrapper.getSnapshot();
    const handle = await wrapper.addListener('playback-progress', listener);

    await handle.remove();
    await wrapper.removeAllListeners();

    expect(state).toBe('playing');
    expect(snapshot.state).toBe('playing');
    expect(LegatoModule.addListener).toHaveBeenCalledWith('playback-progress', listener);
    expect(LegatoModule.removeAllListeners).toHaveBeenCalledTimes(1);
  });

  it('maps getQueue() to queue query bridge', async () => {
    const wrapper = createLegatoWrapper();
    const queue = await wrapper.getQueue();

    expect(LegatoModule.getQueue).toHaveBeenCalledTimes(1);
    expect(queue).toEqual({ tracks: [], currentIndex: null });
  });
});
