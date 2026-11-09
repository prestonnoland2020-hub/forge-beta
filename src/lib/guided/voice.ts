/* FORGE GUIDED — THE COACH'S VOICE AND EARS.

   Speaking: the phone's own text-to-speech, which plays through headphones.
   Listening: the browser's speech recognition, in short bursts between the
   coach's lines (never while it is talking, or it hears itself). Only a few
   words matter, so a sloppy transcript still lands: "I'm done", "done!",
   "finished" are all Done.

   What a web app cannot do — listen with the screen locked, fade music down
   under the coach — needs the native app; this file is the seam where that
   swaps in. */

export type Command =
  | 'done' | 'easy' | 'right' | 'hard' | 'ready' | 'repeat' | 'how'
  | 'easier' | 'harder' | 'pause' | 'resume' | 'skip' | 'more' | 'end' | 'heavier' | 'lighter' | 'start' | 'ask';

/* Order matters: "too easy" before "easy", "not ready" never as ready. */
const RULES: Array<[Command, RegExp]> = [
  /* "Coach, why is it 15 pounds?" — anything addressed to the coach is a
     question for the Forge coach, asked whole. Checked first so the words in
     the question ("too hard?") are not read as commands. */
  ['ask', /^\s*(hey |ok |okay )?coach\b|\bask (the )?coach\b|^\s*question\b/],
  ['end', /\b(end|finish|stop|quit)( the)? workout\b|\bi'?m finished for today\b/],
  ['easier', /\b(make it )?easier\b|\beasier (one|version)\b/],
  ['harder', /\b(make it )?harder\b|\bharder (one|version)\b/],
  ['easy', /\btoo easy\b|\bthat was easy\b|\b(it was |felt )?easy\b|\blight\b/],
  ['hard', /\btoo hard\b|\btoo heavy\b|\bthat was hard\b|\b(it was |felt )?(hard|heavy|tough)\b/],
  ['right', /\bjust right\b|\bperfect\b|\bgood\b|\bfine\b|\bright\b|\bok(ay)?\b/],
  ['heavier', /\bheavier\b|\bmore weight\b|\bgo up\b/],
  ['lighter', /\blighter\b|\bless weight\b|\bgo down\b/],
  ['more', /\bmore (rest|time)\b|\b(30|thirty) more\b|\bneed (a )?minute\b|\bnot ready\b/],
  ['ready', /\bready\b|\blet'?s go\b|\bgo\b|\bnext\b|\bcontinue\b/],
  ['done', /\bdone\b|\bfinished\b|\bcomplete\b|\bthat'?s it\b/],
  ['how', /\bhow (do|does|to)\b|\bshow me\b|\bexplain\b|\bwhat do i do\b/],
  ['repeat', /\brepeat\b|\bsay (that|it) again\b|\bwhat\??$|\bpardon\b|\bcome again\b/],
  ['pause', /\bpause\b|\bhold on\b|\bwait\b/],
  ['resume', /\bresume\b|\bunpause\b|\bkeep going\b/],
  ['skip', /\bskip\b/],
  ['start', /\bstart\b|\bbegin\b/],
];

export function parseCommand(transcript: string, allowed?: Command[]): Command | null {
  const text = ` ${transcript.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const [command, pattern] of RULES) {
    if (allowed && !allowed.includes(command)) continue;
    if (pattern.test(text)) return command;
  }
  return null;
}

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number }; resultIndex: number }) => void) | null;
  onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const canListen = () => typeof window !== 'undefined' && Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

/* A warm, clear English voice where the phone has one. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const prefer = ['Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria', 'Karen', 'Serena'];
  for (const name of prefer) { const found = voices.find(voice => voice.name.includes(name)); if (found) return found; }
  return voices.find(voice => /^en(-|_)US/i.test(voice.lang)) || voices.find(voice => /^en/i.test(voice.lang));
}

export class Coach {
  private recognition: Recognition | null = null;
  private listening = false;
  private wantListen = false;
  private speaking = false;
  private allowed: Command[] | undefined;
  private handler: (command: Command, heard: string) => void = () => {};
  onHeard: (text: string) => void = () => {};
  onState: (state: { speaking: boolean; listening: boolean }) => void = () => {};
  muted = false;
  /* After "Coach?" with no question, the next thing said is the question. */
  freeText = false;

  constructor() {
    if (canSpeak()) window.speechSynthesis.getVoices();
  }

  on(handler: (command: Command, heard: string) => void) { this.handler = handler; }

  /* Says it, then — if hands-free is on — listens for the commands that make
     sense right now. */
  say(text: string, listenFor?: Command[]) {
    this.allowed = listenFor;
    this.stopListening();
    if (!canSpeak() || this.muted) { this.speaking = false; this.emit(); if (listenFor) this.listen(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0; utterance.pitch = 1.0;
    this.speaking = true; this.emit();
    const finish = () => { this.speaking = false; this.emit(); if (listenFor) this.listen(); };
    utterance.onend = finish; utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  /* A short line that does not change what it is listening for (the rest countdown). */
  aside(text: string) {
    if (!canSpeak() || this.muted) return;
    const keep = this.allowed;
    this.say(text, keep);
  }

  setHandsFree(on: boolean) { this.wantListen = on; if (!on) this.stopListening(); else if (!this.speaking && this.allowed) this.listen(); }
  get handsFree() { return this.wantListen; }

  private listen() {
    if (!this.wantListen || !canListen() || this.listening) return;
    const Ctor = ((window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition: new () => Recognition }).webkitSpeechRecognition);
    const recognition = new Ctor();
    recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = false; recognition.maxAlternatives = 3;
    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const alternatives = Array.from(event.results[i]);
        for (const alternative of alternatives) {
          const heard = alternative.transcript;
          const command = parseCommand(heard, this.allowed);
          if (command) { this.onHeard(heard); this.handler(command, heard); return; }
        }
        if (alternatives[0]) {
          this.onHeard(alternatives[0].transcript);
          if (this.freeText) { this.freeText = false; this.handler('ask', alternatives[0].transcript); return; }
        }
      }
    };
    /* Safari ends a session after a pause; while hands-free is on and the
       coach is quiet, start another. */
    recognition.onend = () => { this.listening = false; this.emit(); if (this.wantListen && !this.speaking && this.recognition === recognition) window.setTimeout(() => this.listen(), 250); };
    recognition.onerror = event => { if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { this.wantListen = false; } };
    this.recognition = recognition;
    try { recognition.start(); this.listening = true; this.emit(); } catch { this.listening = false; }
  }

  private stopListening() {
    const recognition = this.recognition;
    this.recognition = null;
    this.listening = false;
    if (recognition) { recognition.onend = null; try { recognition.abort(); } catch { /* already stopped */ } }
    this.emit();
  }

  stop() { this.wantListen = false; this.stopListening(); if (canSpeak()) window.speechSynthesis.cancel(); this.speaking = false; this.emit(); }

  private emit() { this.onState({ speaking: this.speaking, listening: this.listening }); }
}

/* Encouragement, rotated so it does not say the same thing every set. */
const CHEERS = ['Nice work.', 'Strong set.', "That's it.", 'Looking good.', 'Great control.', 'Keep that up.', "You've got this."];
export const cheer = (n: number) => CHEERS[n % CHEERS.length];
