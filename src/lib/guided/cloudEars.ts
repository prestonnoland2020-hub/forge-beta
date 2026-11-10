/* CLOUD EARS — the Wispr Flow way of hearing.

   The microphone stays open for the workout. A small detector watches the
   level: when she starts talking it cuts out that moment — with the third of
   a second before it, so "done" keeps its D — and when she stops, the clip is
   sent to forge-voice and comes back as words. Silence, music under the noise
   floor and the coach's own voice (it is paused while the coach talks) are
   never sent.

   Raw audio is kept in a short rolling buffer and written out as a small WAV
   (16 kHz mono), which every speech model accepts and every browser can make —
   MediaRecorder cannot hand back the start of a sentence it was not already
   recording. */

export type Transcribe = (wav: Blob) => Promise<string>;

const RATE = 16000;
const PRE_ROLL = 0.35;        // seconds kept before speech starts
const END_SILENCE = 650;      // ms of quiet that ends an utterance
const MIN_SPEECH = 220;       // ms; shorter is a cough or a clank
const MAX_SPEECH = 8000;      // ms; then it is sent anyway
const SESSION_CAP = 400;      // clips per workout, a guard on cost

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) { const s = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buffer], { type: 'audio/wav' });
}

/* Average-pick downsampling to 16 kHz: plenty for speech, a third the size. */
function downsample(input: Float32Array, from: number): Float32Array {
  if (from === RATE) return input;
  const ratio = from / RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = start; j < end; j += 1) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export const cloudEarsSupported = () => typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);

export class CloudEars {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private ring: Float32Array[] = [];
  private ringSamples = 0;
  private speech: Float32Array[] = [];
  private speaking = false;
  private speechStart = 0;
  private lastLoud = 0;
  private floor = 0.008;
  private sent = 0;
  private busy = false;
  paused = true;
  onText: (text: string) => void = () => {};
  onLevel: (active: boolean) => void = () => {};
  onError: (error: unknown) => void = () => {};

  constructor(private transcribe: Transcribe) {}

  /* Call from a tap: iOS only opens audio in answer to one. */
  async open() {
    if (this.ctx) { this.wake(); if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return; }
    /* THE AUDIO ENGINE FIRST, STILL INSIDE THE TAP. It used to be made after
       waiting for the microphone, by which point iOS no longer counted it as
       part of the tap and left it suspended: the mic was open, nothing ever
       reached it, and Forge never heard a word (forge-voice had zero calls). */
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const resuming = this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume().catch(() => {});
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    await resuming;
    this.node = this.ctx.createScriptProcessor(2048, 1, 1);
    this.node.onaudioprocess = event => this.frame(event.inputBuffer.getChannelData(0));
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.node);
    /* A processor only runs when connected onward; a muted gain keeps it
       silent so her own voice is never played back. */
    const mute = this.ctx.createGain(); mute.gain.value = 0;
    this.node.connect(mute); mute.connect(this.ctx.destination);
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }

  /* Call from a tap: brings a suspended or interrupted engine back. */
  wake() { if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {}); }

  private frame(input: Float32Array) {
    if (!this.ctx) return;
    const chunk = new Float32Array(input);
    let sum = 0; for (let i = 0; i < chunk.length; i += 1) sum += chunk[i] * chunk[i];
    const rms = Math.sqrt(sum / chunk.length);
    const now = performance.now();
    /* The noise floor follows the room: it falls quickly and rises slowly,
       so a gym's steady hum stops counting as speech after a few seconds. */
    this.floor = rms < this.floor ? this.floor * 0.9 + rms * 0.1 : this.floor * 0.995 + rms * 0.005;
    const threshold = Math.max(0.018, this.floor * 2.8);
    const loud = rms > threshold;

    if (this.paused || this.sent >= SESSION_CAP) { this.reset(); this.keepRing(chunk); return; }
    if (!this.speaking) {
      this.keepRing(chunk);
      if (loud) { this.speaking = true; this.speechStart = now; this.lastLoud = now; this.speech = [...this.ring]; this.onLevel(true); }
      return;
    }
    this.speech.push(chunk);
    if (loud) this.lastLoud = now;
    const length = now - this.speechStart;
    if (now - this.lastLoud > END_SILENCE || length > MAX_SPEECH) {
      const voiced = this.lastLoud - this.speechStart;
      const clip = this.speech;
      this.reset();
      this.onLevel(false);
      if (voiced >= MIN_SPEECH) void this.send(clip);
    }
  }

  private keepRing(chunk: Float32Array) {
    this.ring.push(chunk); this.ringSamples += chunk.length;
    const keep = (this.ctx?.sampleRate || 48000) * PRE_ROLL;
    while (this.ringSamples - (this.ring[0]?.length || 0) > keep) this.ringSamples -= this.ring.shift()!.length;
  }

  private reset() { this.speaking = false; this.speech = []; }

  private async send(parts: Float32Array[]) {
    if (this.busy || !this.ctx) return;
    this.busy = true; this.sent += 1;
    try {
      const total = parts.reduce((sum, part) => sum + part.length, 0);
      const joined = new Float32Array(total);
      let offset = 0; for (const part of parts) { joined.set(part, offset); offset += part.length; }
      const text = await this.transcribe(encodeWav(downsample(joined, this.ctx.sampleRate), RATE));
      if (text && !this.paused) this.onText(text);
    } catch (error) { this.onError(error); }
    finally { this.busy = false; }
  }

  /* Let go of the microphone while the coach talks, keeping the audio
     engine running so taking it back needs no tap. */
  private source: MediaStreamAudioSourceNode | null = null;
  releaseMic() {
    try { this.source?.disconnect(); } catch { /* already */ }
    this.stream?.getTracks().forEach(track => track.stop());
    this.source = null; this.stream = null; this.reset();
  }
  async takeMic() {
    if (!this.ctx || !this.node) { await this.open(); return; }
    this.wake();
    if (this.stream && this.stream.getAudioTracks().some(track => track.readyState === 'live')) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.node);
  }

  close() {
    this.paused = true;
    try { this.node?.disconnect(); this.source?.disconnect(); } catch { /* already */ }
    this.source = null;
    this.stream?.getTracks().forEach(track => track.stop());
    void this.ctx?.close().catch(() => {});
    this.ctx = null; this.node = null; this.stream = null; this.sent = 0;
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
