import { Capacitor, registerPlugin } from '@capacitor/core';

/* THE LIVE WORKOUT TICKER (iPhone). While a coached workout runs, iOS shows
   the move, the set and a running clock on the lock screen and in the Dynamic
   Island, so it stays in view when she switches to music or messages. The
   clocks are drawn by iOS from the dates sent here, so they keep counting
   while Forge is in the background. Does nothing on the web or older iPhones. */

export type TickerState = {
  title: string;
  detail: string;
  phase: 'work' | 'rest' | 'paused' | 'done';
  restEndsAt?: number;
  /* A word or two for the small Dynamic Island: "2/3", "Rest". */
  short?: string;
  done: number;
  total: number;
};

type Plugin = {
  start(options: TickerState & { workoutTitle: string; startedAt: number }): Promise<{ started: boolean }>;
  update(options: TickerState): Promise<void>;
  end(options: TickerState & { finished: boolean }): Promise<void>;
};

const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
const plugin = native ? registerPlugin<Plugin>('ForgeLiveActivity') : null;
let live = false;
let last = '';

export function tickerStart(workoutTitle: string, startedAt: number, state: TickerState) {
  if (!plugin) return;
  last = JSON.stringify(state);
  live = true;
  plugin.start({ ...state, workoutTitle, startedAt }).then(result => { live = result.started; }).catch(() => { live = false; });
}

export function tickerUpdate(state: TickerState) {
  if (!plugin || !live) return;
  const key = JSON.stringify(state);
  if (key === last) return;
  last = key;
  plugin.update(state).catch(() => { /* the workout never depends on it */ });
}

export function tickerEnd(finished: boolean, state: TickerState) {
  if (!plugin || !live) return;
  live = false; last = '';
  plugin.end({ ...state, finished }).catch(() => { /* fine */ });
}

export const tickerLive = () => live;
