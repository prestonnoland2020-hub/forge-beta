import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/* The coach's native ears and mouth in the iPhone app (ForgeVoicePlugin.swift):
   hands-free listening with iPhone's own speech recognition, and full-quality
   playback of the coach's lines over music. Absent on the web. */

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
  addListener(event: 'heard', handler: (data: { text: string; final: boolean }) => void): Promise<PluginListenerHandle>;
};

const supported = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export const nativeVoice: Plugin | null = supported ? registerPlugin<Plugin>('ForgeVoice') : null;
export const hasNativeVoice = () => Boolean(nativeVoice);
