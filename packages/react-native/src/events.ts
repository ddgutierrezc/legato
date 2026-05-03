import { LEGATO_EVENT_NAMES } from '@ddgutierrezc/legato-contract';
import type { LegatoEventName, LegatoEventPayloadMap } from '@ddgutierrezc/legato-contract';
import { createLegatoWrapper } from './legato-wrapper';

export const LEGATO_EVENTS = LEGATO_EVENT_NAMES;

export function addLegatoListener<E extends LegatoEventName>(
  eventName: E,
  listener: (payload: LegatoEventPayloadMap[E]) => void,
) {
  return createLegatoWrapper().addListener(eventName, listener);
}
