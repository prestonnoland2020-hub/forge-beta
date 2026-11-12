import { chromium } from 'playwright';
/* Every voice path the coach can take, with a stand-in for the iPhone's
   native voice plugin that can be told to fail in each way. The rule under
   test: in the app the robot voice never speaks a line that has a recording. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext()).newPage();
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto('http://localhost:5199/'); await p.waitForTimeout(1500);
const results = await p.evaluate(async () => {
  const nv = await import('/src/lib/guided/nativeVoice.ts');
  const { Coach } = await import('/src/lib/guided/voice.ts');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /* A real, playable recording (0.1 s silent WAV) for every line. */
  const n = 800, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
  const w = (o, s) => [...s].forEach((c, i) => buf[o + i] = c.charCodeAt(0));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); buf.fill(128, 44);
  const tts = async () => new Blob([buf], { type: 'audio/wav' });
  let robot = [];
  const realSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.speechSynthesis.speak = u => { robot.push(u.text); setTimeout(() => u.onend?.(), 5); };
  const fake = (opts = {}) => {
    const log = { played: 0, playedAudio: 0, listenOn: 0, listenOff: 0, starts: 0, reset: 0, stop: 0, stopPlaying: 0 };
    let heard = null;
    return { log, emit: (text, final) => heard?.({ text, final }), plugin: {
      permission: async () => ({ status: opts.permission || 'granted' }),
      requestPermission: async () => ({ status: opts.permission || 'granted' }),
      start: async () => { log.starts++; return opts.startFails ? { started: false, reason: 'The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error -10868.)' } : { started: true }; },
      listen: async ({ on }) => { on ? log.listenOn++ : log.listenOff++; },
      mute: async () => {}, reset: async () => { log.reset++; },
      play: async ({ audio }) => { if (opts.playThrows) throw new Error('"ForgeVoice" plugin is not implemented on ios'); log.played++; if (audio && audio.length > 20) log.playedAudio++; await wait(10); return { cancelled: false }; },
      stopPlaying: async () => { log.stopPlaying++; }, stop: async () => { log.stop++; },
      setScript: async () => {}, setAudio: async () => {}, takeBackground: async () => ({ ran: false, index: 0, entered: true, log: [], restEndsAt: 0, timedEndsAt: 0 }),
      addListener: async (_e, h) => { heard = h; return { remove: async () => { heard = null; } }; },
    } };
  };
  const lines = ["Alright, let's do this.", 'Alright, Goblet squat. 3 sets, 10 reps at 25 pounds.', "How'd that feel? Too easy, just right, or too hard?", 'Yes! Good set. Take 90 seconds.', 'Ten seconds.', "And that's the workout!"];
  const run = async (name, opts, extra) => {
    robot = [];
    const f = fake(opts); nv.__setNativeVoiceForTests(f.plugin);
    const c = new Coach(); const reports = []; c.onReport = (e, d) => reports.push(e + (d ? ':' + d.slice(0, 30) : ''));
    c.useNaturalVoice(opts.ttsFails ? async () => { throw new Error('offline'); } : tts);
    c.setHandsFree(true);
    await c.useNative();
    const tag = opts.ttsFails ? ' (offline test)' : '';
    for (const line of lines.slice(0, 5)) { c.say(line + tag, ['done', 'easy', 'right', 'hard', 'ready']); await wait(120); }
    c.aside('Ten seconds.'); await wait(120);
    let ok = true; const notes = [];
    if (extra) { const r = await extra(c, f); ok = r.ok; notes.push(r.note); }
    c.hush(); c.farewell(lines[5]); await wait(1500);
    return { name, robot: robot.length, robotLines: robot.slice(0, 3), native: f.log, extraOk: ok, notes, reports: [...new Set(reports)].slice(0, 8), stoppedAfterGoodbye: f.log.stop > 0 || f.log.stopPlaying > 0 };
  };
  const out = [];
  out.push(await run('app: all good', {}, async (c, f) => {
    let got = null; c.on(cmd => { got = cmd; });
    c.say('Alright, Goblet squat.', ['done']); await wait(150);
    f.emit('Done', false); await wait(20);
    return { ok: got === 'done' && f.log.reset > 0, note: `heard→${got} reset=${f.log.reset}` };
  }));
  out.push(await run('app: mic engine fails (-10868)', { startFails: true }));
  out.push(await run('app: mic fails once, then retries and listens', { startFails: true }, async (c, f) => {
    f.plugin.start = async () => { f.log.starts++; return { started: true }; };
    c['lastNativeTry'] = 0; c.say('Alright, Goblet squat.', ['done']); await wait(300);
    return { ok: f.log.starts >= 2 && f.log.listenOn > 0, note: `starts=${f.log.starts} listenOn=${f.log.listenOn}` };
  }));
  out.push(await run('app: mic/speech permission denied', { permission: 'denied' }));
  out.push(await run('app: native player missing', { playThrows: true }));
  out.push(await run('app: recording fetch fails (offline)', { ttsFails: true }));
  nv.__setNativeVoiceForTests(null);
  { robot = []; const c = new Coach(); c.useNaturalVoice(tts); c.unlockAudio(); await wait(100); for (const line of lines) { c.say(line); await wait(250); } out.push({ name: 'web (no app)', robot: robot.length, robotLines: robot }); }
  window.speechSynthesis.speak = realSpeak;
  return out;
});
for (const r of results) console.log(JSON.stringify(r));
await b.close();
