import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/* The coach's native ears and mouth in the iPhone app (ForgeVoicePlugin.swift):
   hands-free listening with iPhone's own speech recognition, and full-quality
   playback of the coach's lines over music. Absent on the web. */

/* One step of the background coach's script (see ForgeVoicePlugin.swift). */
export type ScriptBeat = { id: string; kind: 'card' | 'feel' | 'rest' | 'end'; line: string; seconds: number; timed: boolean; perSide: boolean; step: number; set: number; ticker: { title: string; detail: string; done: number; total: number } };
export type NativeMicStatus = 'granted' | 'denied' | 'unknown';
type Plugin = {
  permission(): Promise<{ status: NativeMicStatus }>;
  requestPermission(): Promise<{ status: NativeMicStatus }>;
  start(options: { hints: string[]; listen: boolean }): Promise<{ started: boolean; reason?: string }>;
  listen(options: { on: boolean; hints?: string[] }): Promise<void>;
  mute(): Promise<void>;
  reset(): Promise<void>;
  play(options: { audio?: string; text?: string }): Promise<{ cancelled: boolean }>;
  stopPlaying(): Promise<void>;
  stop(): Promise<void>;
  setScript(options: { beats: ScriptBeat[]; entered: boolean; restEndsAt?: number; timedEndsAt?: number }): Promise<void>;
  setAudio(options: { id: string; audio: string }): Promise<void>;
  takeBackground(): Promise<{ ran: boolean; index: number; entered: boolean; log: Array<{ type: 'set' | 'end'; step?: number; set?: number; feel?: 'easy' | 'right' | 'hard' }>; restEndsAt: number; timedEndsAt: number }>;
  addListener(event: 'heard', handler: (data: { text: string; final: boolean }) => void): Promise<PluginListenerHandle>;
};

const supported = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export const nativeVoice: Plugin | null = supported ? registerPlugin<Plugin>('ForgeVoice') : null;
export const hasNativeVoice = () => Boolean(nativeVoice);
