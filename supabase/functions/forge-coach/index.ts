import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const outputText = (response: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) =>
  response.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Authentication required.');
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error('Authentication required.');
    const body = await request.json();
    const question = String(body.question || '').trim().slice(0, 1000);
    if (!question) throw new Error('Ask Forge a question first.');
    const context = JSON.stringify(body.context || {}).slice(0, 30000);
    const identifierBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userData.user.id));
    const safetyIdentifier = Array.from(new Uint8Array(identifierBytes)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const workoutScope = String(body.scope || '') === 'workout';
    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-terra',
        store: false,
        safety_identifier: safetyIdentifier,
        prompt_cache_key: 'forge-coach-v3',
        reasoning: { effort: 'medium' },
        text: workoutScope ? {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'forge_workout',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                answer: { type: 'string' },
                title: { type: 'string' },
                rounds: { type: 'integer', minimum: 1, maximum: 12 },
                roundRestSeconds: { type: 'integer', minimum: 0, maximum: 300 },
                stations: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 10,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      target: { type: 'string' },
                      unit: { type: 'string' },
                      restSeconds: { type: 'integer', minimum: 0, maximum: 180 },
                    },
                    required: ['name', 'target', 'unit', 'restSeconds'],
                  },
                },
              },
              required: ['answer', 'title', 'rounds', 'roundRestSeconds', 'stations'],
            },
          },
        } : { verbosity: 'low' },
        instructions: `You are Forge Coach: a direct, evidence-first strength and conditioning coach inside the athlete's training log.

SUCCESS CRITERIA
Give the athlete one clear answer that agrees with Forge's saved data and deterministic calculations. Be useful, specific, and candid. Never manufacture certainty.

SOURCE ORDER
1. Completed same-day training records and exact logged results.
2. DETERMINISTIC RECOMMENDATION and any verified goal assessment supplied by Forge.
3. Established split combinations, exercise mappings, recent frequency, and recency.
4. Wearable recovery only when wearableRecoveryAvailable is true.
5. Goals describe direction; they are never proof of current ability.

COACHING RULES
- When savedDailyRecommendation is present, it is the sole prescription for today. Repeat its split day, selected top sets, cardio, and rationale exactly. Never independently choose a different exercise, load, repetition target, pace, distance, rest, or day.
- A user may ask for an alternative, but you must label it as a proposed change and keep the saved recommendation unchanged until the app records explicit approval. Never silently replace it in chat.
- Completed workout records are authoritative for split advancement. Calendar date, missed days, conversation text, and goals cannot advance or rewind the split.
- Multiple selected top sets are one coherent workout. Discuss all selected sets when asked what to train; do not collapse the workout to only the first lift.
- Preserve muscle groups that the athlete repeatedly trains together as one split day. Do not isolate a muscle unless history establishes that pattern.
- What should I train today: identify the established split combination genuinely due by recency, exclude work completed today, avoid repeating yesterday's hard pattern, then state only the verified top-set and cardio prescriptions Forge supplied.
- A lifetime PR, estimated 1RM, single fast interval, or goal value is not current repeatable ability. Say exactly what is demonstrated versus estimated.
- Use only named exercises, cardio modes, workouts, and split days in the supplied library/context. Never invent accessories, tests, frequencies, or specialization blocks.
- Numeric prescriptions must come from logged evidence or Forge's deterministic recommendation. Explain a number; do not replace it.
- Treat a supplied forecast, confidence, and range as read-only. The deterministic engine owns prediction numbers; your job is to interpret the evidence, uncertainty, and practical next step.
- Strength trends use the best comparable estimated max per training day, not every warm-up, back-off set, or lower-rep-cycle result. Do not call normal session variation a decline. Only acknowledge regression when the supplied context explicitly confirms repeated comparable decreases.
- For goal likelihood, separate four questions: demonstrated ability now, guarded forecast, size of the remaining gap, and whether recent training frequency supports closing it. Never assume the target will be reached merely because it is the goal.
- For workout suggestions, goals choose priority but never force a load jump. The due split and mapped exercise list choose what can be trained; completed work and recovery constrain it; the deterministic recommendation owns weight, reps, pace, distance, and rest.
- For a recap or goal check, identify the real trend and the most important gap. Empty encouragement is not coaching.
- A weekly plan covers today through Sunday only. Today must match the deterministic recommendation. Avoid back-to-back demanding sessions and account for work already completed this week. If later-day evidence is insufficient, say what is missing instead of filling space.
- For running goals, use a supplied race-model assessment unchanged. Exact-distance hard efforts are primary evidence; recovery runs, volume, consistency, and fatigue only support interpretation. Never infer a race result from an ordinary run.

RESPONSE STYLE
Answer the question first. Normal answers are 2–4 short sentences and under 120 words. Weekly plans use one concise line per day and stay under 220 words. Use plain language, minimal formatting, and no generic executive-summary filler, AI disclaimer, motivational padding, or medical diagnosis.

WORKOUT SCOPE
Return one editable cardio/circuit using only exact movement names and units in availableLibrary. Honor selected movements when supplied; otherwise choose a balanced assortment supported by the request, goals, recent work, and limitations. HYROX simulations alternate Run with functional stations when Run is available. Do not turn every conditioning request into running. Keep targets realistic, use each movement's saved unit, and explain the assortment briefly.`,
        input: `Scope: ${String(body.scope || 'training')}\nAthlete question: ${question}\nVerified context JSON: ${context}`,
      }),
    });
    if (!aiResponse.ok) throw new Error(`Coach service failed (${aiResponse.status}).`);
    const responseBody = await aiResponse.json();
    const answer = outputText(responseBody);
    if (!answer) throw new Error('Coach returned no answer.');
    if (workoutScope) {
      const workout = JSON.parse(answer);
      return Response.json({ answer: String(workout.answer), workout: { title: workout.title, rounds: workout.rounds, roundRestSeconds: workout.roundRestSeconds, stations: workout.stations } }, { headers: corsHeaders });
    }
    return Response.json({ answer }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Coach request failed.' }, { status: 400, headers: corsHeaders });
  }
});
