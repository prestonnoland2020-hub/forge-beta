import { consumeQuota, corsFor, errorResponse, HttpError, refundQuota, requireCaller } from '../_shared/guard.ts';

/* FORGE VOICE — how Wispr Flow hears, for the Guided coach.

   The phone's own recognizer is free but weak in a loud gym and missing in a
   home-screen web app. This takes a short clip of what the athlete said,
   sends it to a strong cloud speech model, and hands back the words. The
   prompt carries the words that matter right now (done, ready, too easy…),
   the phrases this athlete is known to say, and the move she is on, which is
   what keeps "dawn" from coming back for "done".

   Metered like the coach (endpoint 'forge-voice'), refunded when it fails.
   Nothing is stored: the clip goes to the provider and the text comes back. */

const MAX_BYTES = 1_500_000; // ~ a 20 s clip; commands are 1–3 s

Deno.serve(async (request: Request) => {
  const cors = corsFor(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let caller: Awaited<ReturnType<typeof requireCaller>> | null = null;
  let spent = false;
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'POST only.');
    caller = await requireCaller(request);
    const body = await request.json().catch(() => ({})) as { audio?: string; mime?: string; words?: unknown; phrases?: unknown; context?: unknown };
    const audio = typeof body.audio === 'string' ? body.audio : '';
    if (!audio) throw new HttpError(400, 'No audio.');
    const bytes = Uint8Array.from(atob(audio), char => char.charCodeAt(0));
    if (bytes.length < 800) return Response.json({ text: '' }, { headers: cors });
    if (bytes.length > MAX_BYTES) throw new HttpError(413, 'That clip is too long.');
    await consumeQuota(caller, 'forge-voice');
    spent = true;

    const mime = typeof body.mime === 'string' && /^audio\//.test(body.mime) ? body.mime.split(';')[0] : 'audio/webm';
    const extension = mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
    const list = (value: unknown, max: number) => Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => String(item).slice(0, 40)).slice(0, max) : [];
    const words = list(body.words, 24);
    const phrases = list(body.phrases, 40);
    const context = typeof body.context === 'string' ? body.context.slice(0, 200) : '';
    const prompt = [
      'A person mid-workout talking to their fitness coach through headphones. Short commands, sometimes a question.',
      words.length ? `Likely words right now: ${words.join(', ')}.` : '',
      phrases.length ? `This person also says: ${phrases.join(', ')}.` : '',
      context ? `Current exercise: ${context}.` : '',
    ].filter(Boolean).join(' ');

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), `clip.${extension}`);
    form.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'gpt-4o-mini-transcribe');
    form.append('language', 'en');
    form.append('prompt', prompt);
    form.append('response_format', 'json');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}` },
      body: form,
    });
    if (!response.ok) {
      console.error('forge-voice-provider', response.status, (await response.text()).slice(0, 300));
      throw new HttpError(502, 'Voice is briefly unavailable.');
    }
    const result = await response.json() as { text?: string };
    return Response.json({ text: String(result.text || '').trim() }, { headers: cors });
  } catch (error) {
    if (spent && caller) await refundQuota(caller, 'forge-voice');
    return errorResponse(error, cors);
  }
});
