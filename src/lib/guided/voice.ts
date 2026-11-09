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

/* ---------- Learning how the phone hears HER ----------

   A web app cannot retrain the phone's speech engine on one voice. What it
   can learn is how that engine hears her: if her "done" keeps arriving as
   "dawn", the coach learns that "dawn" means done. Three ways in:
   - a voice check: she says three words once and whatever the phone heard
     is remembered for each;
   - "Did you mean…?": when nothing matched, one tap teaches the phrase;
   - close calls: a near-miss of a known phrase ("redy") counts, and a very
     close one is remembered.
   Stored on the device, never sent anywhere. */
const MEMORY_KEY = 'forge-guided-voice-v1';
export const normalizePhrase = (text: string) => text.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
export function loadVoiceMemory(): Record<string, Command> {
  try { const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}'); return saved && typeof saved === 'object' ? saved : {}; } catch { return {}; }
}
export function teachPhrase(heard: string, command: Command) {
  const phrase = normalizePhrase(heard);
  if (!phrase || phrase.split(' ').length > 6 || command === 'ask') return;
  const memory = loadVoiceMemory();
  memory[phrase] = command;
  const keys = Object.keys(memory);
  if (keys.length > 200) delete memory[keys[0]];
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memory)); } catch { /* full */ }
}
export function forgetVoice() { try { localStorage.removeItem(MEMORY_KEY); } catch { /* nothing */ } }

/* What speech engines commonly hand back for these words. */
const SOUNDS_LIKE: Record<string, Command> = {
  dun: 'done', dunn: 'done', dawn: 'done', don: 'done', dumb: 'done', dan: 'done', 'im dun': 'done', 'i am done': 'done', 'all done': 'done', nun: 'done',
  redi: 'ready', reddy: 'ready', redy: 'ready', radio: 'ready', teddy: 'ready', 'im ready': 'ready', freddie: 'ready', ready: 'ready',
  'to easy': 'easy', 'two easy': 'easy', '2 easy': 'easy', 'too ez': 'easy', 'it was easy': 'easy',
  'just write': 'right', 'just rite': 'right', 'just ride': 'right', 'jess right': 'right', 'just white': 'right',
  'to hard': 'hard', 'two hard': 'hard', '2 hard': 'hard', 'too heard': 'hard', 'to heavy': 'hard', 'too hot': 'hard',
  'more rest': 'more', 'more time': 'more', 'repeat that': 'repeat', 'say again': 'repeat', 'skipped': 'skip', 'escape': 'skip',
};
const CANON: Array<[Command, string]> = [
  ['done', 'done'], ['done', 'im done'], ['done', 'finished'], ['ready', 'ready'], ['ready', 'im ready'], ['ready', 'lets go'],
  ['easy', 'too easy'], ['right', 'just right'], ['right', 'perfect'], ['hard', 'too hard'], ['how', 'how do i do this'], ['how', 'show me'],
  ['repeat', 'repeat'], ['more', 'more rest'], ['easier', 'easier'], ['harder', 'harder'], ['heavier', 'heavier'], ['lighter', 'lighter'],
  ['skip', 'skip'], ['pause', 'pause'], ['resume', 'resume'], ['end', 'end workout'],
];
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) { const keep = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = keep; }
  }
  return row[b.length];
}
const similarity = (a: string, b: string) => 1 - distance(a, b) / Math.max(a.length, b.length, 1);

export type Match = { command: Command; how: 'rule' | 'learned' | 'sounds-like' | 'close' ; score: number };
export function matchCommand(transcript: string, allowed?: Command[], memory: Record<string, Command> = {}): Match | null {
  const ok = (command: Command) => !allowed || allowed.includes(command);
  const rule = parseCommand(transcript, allowed);
  if (rule) return { command: rule, how: 'rule', score: 1 };
  const phrase = normalizePhrase(transcript);
  if (!phrase) return null;
  if (memory[phrase] && ok(memory[phrase])) return { command: memory[phrase], how: 'learned', score: 1 };
  if (SOUNDS_LIKE[phrase] && ok(SOUNDS_LIKE[phrase])) return { command: SOUNDS_LIKE[phrase], how: 'sounds-like', score: 0.9 };
  /* Close calls, only for short things said (a whole sentence that happens
     to sound like "ready" is not a command). */
  if (phrase.split(' ').length > 4) return null;
  let best: Match | null = null;
  const candidates: Array<[Command, string]> = [...CANON, ...Object.entries(memory).map(([text, command]) => [command, text] as [Command, string])];
  for (const [command, text] of candidates) {
    if (!ok(command)) continue;
    const score = similarity(phrase, text);
    if (score >= 0.72 && (!best || score > best.score)) best = { command, how: 'close', score };
  }
  return best;
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
  /* The voice check: the next thing said goes here, every alternative. */
  capture: ((heard: string[]) => void) | null = null;
  onUnknown: (heard: string) => void = () => {};
  memory: Record<string, Command> = {};
  reloadMemory() { this.memory = typeof localStorage === 'undefined' ? {} : loadVoiceMemory(); }

  constructor() {
    if (canSpeak()) window.speechSynthesis.getVoices();
    this.reloadMemory();
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
    /* Her phone's English, so an Australian or British accent is heard by
       the model trained for it. */
    const lang = typeof navigator !== 'undefined' && /^en/i.test(navigator.language || '') ? navigator.language : 'en-US';
    recognition.lang = lang; recognition.continuous = true; recognition.interimResults = false; recognition.maxAlternatives = 5;
    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const alternatives = Array.from(event.results[i]).map(item => item.transcript).filter(Boolean);
        if (!alternatives.length) continue;
        if (this.capture) { const take = this.capture; this.capture = null; this.onHeard(alternatives[0]); take(alternatives); return; }
        /* Every alternative the engine offers is tried; the best match wins. */
        let best: { match: Match; heard: string } | null = null;
        for (const heard of alternatives) {
          const match = matchCommand(heard, this.allowed, this.memory);
          if (match && (!best || match.score > best.match.score)) best = { match, heard };
          if (match?.how === 'rule' || match?.how === 'learned') break;
        }
        if (best) {
          /* A very close call is remembered, so next time it is exact. */
          if (best.match.how === 'close' && best.match.score >= 0.85) { teachPhrase(best.heard, best.match.command); this.reloadMemory(); }
          this.onHeard(best.heard); this.handler(best.match.command, best.heard); return;
        }
        this.onHeard(alternatives[0]);
        if (this.freeText) { this.freeText = false; this.handler('ask', alternatives[0]); return; }
        this.onUnknown(alternatives[0]);
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
