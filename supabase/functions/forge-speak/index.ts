import { consumeQuota, corsFor, errorResponse, HttpError, refundQuota, requireCaller } from '../_shared/guard.ts';

/* FORGE SPEAK — the Guided coach's voice.

   The phone's built-in voice is robotic and choppy. This turns one coach line
   into natural speech with OpenAI's voices, told to sound like a warm trainer
   in her headphones. The app caches every line it has heard, so "Rest 90
   seconds" is fetched once, ever; it falls back to the phone's voice if this
   is slow or down. Metered as 'forge-speak'; nothing is stored here. */

const VOICES = new Set(['coral', 'ash', 'sage', 'onyx', 'nova', 'shimmer', 'alloy', 'echo', 'ballad', 'verse', 'fable']);
const STYLE = [
  'Voice: a real personal trainer, relaxed and warm, talking to one person through their headphones. Not an announcer, not a narrator, not an assistant.',
  'Delivery: conversational and human. Natural rises and falls in pitch, light emphasis on the key word, a smile in the voice. Contractions are natural.',
  'Pacing: unhurried but alive. Small natural pauses at commas and between sentences. Never read it flat or evenly spaced.',
  'Energy: encouraging and genuine. A little more lift on praise ("Yes! Good set."), calmer and clear on instructions. Never shouty, never cheesy, never robotic.',
].join(' ');

Deno.serve(async (request: Request) => {
  const cors = corsFor(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let caller: Awaited<ReturnType<typeof requireCaller>> | null = null;
  let spent = false;
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'POST only.');
    caller = await requireCaller(request);
    const body = await request.json().catch(() => ({})) as { text?: unknown; voice?: unknown };
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 600) : '';
    if (!text) throw new HttpError(400, 'Nothing to say.');
    const voice = typeof body.voice === 'string' && VOICES.has(body.voice) ? body.voice : 'coral';
    await consumeQuota(caller, 'forge-speak');
    spent = true;
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts', voice, input: text, instructions: STYLE, response_format: 'mp3' }),
    });
    if (!response.ok || !response.body) {
      console.error('forge-speak-provider', response.status, (await response.text()).slice(0, 300));
      throw new HttpError(502, 'The coach voice is briefly unavailable.');
    }
    const audio = await response.arrayBuffer();
    return new Response(audio, { headers: { ...cors, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000' } });
  } catch (error) {
    if (spent && caller) await refundQuota(caller, 'forge-speak');
    return errorResponse(error, cors);
  }
});
