import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { consumeQuota, corsFor, errorResponse, HttpError, refundQuota, requireCaller } from '../_shared/guard.ts';

/* FORGE SPEAK — the Guided coach's voice.

   The phone's built-in voice is robotic and choppy. This turns one coach line
   into natural speech with OpenAI's voices, told to sound like a warm trainer
   in her headphones. The app caches every line it has heard, so "Rest 90
   seconds" is fetched once, ever; it falls back to the phone's voice if this
   is slow or down. Metered as 'forge-speak'; nothing is stored here. */

const VOICES = new Set(['coral', 'ash', 'sage', 'onyx', 'nova', 'shimmer', 'alloy', 'echo', 'ballad', 'verse', 'fable', 'marin', 'cedar']);
/* The app asks for "coral" (female) or "ash" (male). OpenAI's best-quality
   voices are marin and cedar, so those are what it gets. */
const BEST: Record<string, string> = { coral: 'marin', ash: 'cedar' };
const female = (voice: string) => !['ash', 'cedar', 'onyx', 'echo', 'verse', 'ballad', 'fable'].includes(voice);

/* ELEVENLABS, the most human-sounding voices available. Used whenever the
   ELEVENLABS_API_KEY secret is set; OpenAI is the fallback. Voices can be
   changed with ELEVENLABS_VOICE_FEMALE / ELEVENLABS_VOICE_MALE (voice IDs). */
/* The key comes from the ELEVENLABS_API_KEY secret, or, when that is not
   set, from the server_secrets table (RLS on, no policies: only the service
   role reads it). Looked up once per warm instance. */
let storedKey: Promise<string | null> | null = null;
function elevenLabsKey(admin: SupabaseClient): Promise<string | null> {
  const env = Deno.env.get('ELEVENLABS_API_KEY');
  if (env) return Promise.resolve(env);
  storedKey ??= (async () => {
    const { data } = await admin.from('server_secrets').select('value').eq('name', 'ELEVENLABS_API_KEY').maybeSingle();
    return (data as { value?: string } | null)?.value || null;
  })().catch(() => null);
  return storedKey;
}

async function elevenLabs(text: string, voice: string, admin: SupabaseClient): Promise<ArrayBuffer | null> {
  const key = await elevenLabsKey(admin);
  if (!key) return null;
  const id = female(voice) ? (Deno.env.get('ELEVENLABS_VOICE_FEMALE') || 'EXAVITQu4vr4xnSDxMaL') : (Deno.env.get('ELEVENLABS_VOICE_MALE') || 'nPczCjzI2devNBz1zQrb');
  /* ElevenLabs plans cap how many lines are made at once (Starter: 3). A
     line turned away for that is retried after a short wait instead of
     falling back to the OpenAI voice, which mixed two voices in one workout. */
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: Deno.env.get('ELEVENLABS_MODEL') || 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
    });
    if (response.ok) return await response.arrayBuffer();
    const detail = (await response.text()).slice(0, 300);
    if (response.status === 429 && attempt < 5) { await new Promise(done => setTimeout(done, 350 + attempt * 400 + Math.random() * 300)); continue; }
    console.error('forge-speak-elevenlabs', response.status, detail);
    return null;
  }
  return null;
}
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
    const human = await elevenLabs(text, voice, caller.admin);
    if (human) return new Response(human, { headers: { ...cors, 'Content-Type': 'application/octet-stream', 'X-Voice-Provider': 'elevenlabs' } });
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts', voice: BEST[voice] || voice, input: text, instructions: STYLE, response_format: 'mp3' }),
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
