import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const outputText = (response: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) =>
  response.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';

/* One generated program: week-by-week strength progression per split day plus
   a scaled running plan. The client stores the result and renders the Plan tab
   from it until the athlete refreshes. */
const planSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    easyPace: { type: 'string' },
    weeks: {
      type: 'array',
      minItems: 4,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          week: { type: 'integer', minimum: 1, maximum: 16 },
          phase: { type: 'string', enum: ['Base', 'Build', 'Peak', 'Deload', 'Taper', 'Race'] },
          mileage: { type: 'number', minimum: 0, maximum: 120 },
          longRunMiles: { type: 'number', minimum: 0, maximum: 30 },
          longRunPace: { type: 'string' },
          quality: { type: 'string' },
          qualityPace: { type: 'string' },
          qualityDay: { type: 'string' },
          longRunDay: { type: 'string' },
          easyDays: { type: 'array', minItems: 0, maxItems: 7, items: { type: 'string' } },
          easyMinutes: { type: 'integer', minimum: 0, maximum: 120 },
          easyPace: { type: 'string' },
          topSets: {
            type: 'array',
            minItems: 0,
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                splitDay: { type: 'string' },
                exercise: { type: 'string' },
                weight: { type: 'number', minimum: 0, maximum: 1500 },
                reps: { type: 'integer', minimum: 1, maximum: 20 },
              },
              required: ['splitDay', 'exercise', 'weight', 'reps'],
            },
          },
          note: { type: 'string' },
        },
        required: ['week', 'phase', 'mileage', 'longRunMiles', 'longRunPace', 'quality', 'qualityPace', 'qualityDay', 'longRunDay', 'easyDays', 'easyMinutes', 'easyPace', 'topSets', 'note'],
      },
    },
  },
  required: ['summary', 'easyPace', 'weeks'],
};

const planInstructions = `You are Forge's program builder. Build ONE coherent multi-week training program from the athlete's verified data: their goals, their split (with the exercises they mapped to each day), their logged bests, and their actual logged running.

STRENGTH RULES — THE 8/6/4/2 WAVE (Forge's fixed progression system)
- Every strength or mixed split day that has mapped exercises gets exactly one top-set prescription per week, using ONLY exercises from that day's mapped list. Use the day's exact name in splitDay.
- Reps cycle in 4-week waves: week 1 of a wave = 8 reps, week 2 = 6, week 3 = 4, week 4 = MAX WEEK at 2 reps.
- Weeks 1-3: weight = the wave's target max converted to that rep count by inverse Epley (weight = max / (1 + reps/30)), rounded to 5 lb — the same implied max expressed across 8s, 6s, and 4s. The wave's target max for wave 1 is the athlete's logged best calculated max for that lift.
- MAX WEEK (every 4th week): a 2-rep attempt implying the wave's target max PLUS 5-10 lb — the athlete attempts a new PR. Strength volume is low that week, which pairs with the running deload.
- Every wave anchors to the athlete's CURRENT logged best — a new wave only rises once the previous max attempt is actually logged. Never prescribe a set implying a max below the logged best.\n- Use the athlete's unit system (context.units): pounds in 5 lb steps, or kilograms in 2.5 kg steps; running in miles and /mi pace, or kilometers and /km pace.

RUNNING RULES
- Scale weekly mileage from the athlete's CURRENT logged weekly volume toward what the endurance goal requires, growing at most ~8-10% per week, within the athlete's stated min/max weekly mileage. Deload weeks cut mileage ~20%.
- The athlete runs exactly their stated running days per week. One long run (25-35% of the week, growing gradually from their current longest), at most one quality session, the rest easy.
- EASY PACE comes from the athlete's LOGGED average easy pace — roughly their logged pace, drifting only slightly faster as fitness builds. Never derive easy pace from goal race pace. Easy runs must be comfortably slower than any race or quality pace.
- Quality sessions progress logically: shorter reps at goal effort early, longer reps and threshold work mid-plan, race-specific work late. State them compactly like "6 × 400 m" with qualityPace like "1:38/rep" or "7:10/mi".
- PLACEMENT: name days using the athlete's exact split-day names. Runs may be placed on ANY split day, including strength days as an easy double, so the athlete hits their stated running days per week. The long run gets its own day (longRunDay) with no other running and ideally light or no lifting.
- A LOWER-BODY DAY is defined by the day's MUSCLES, never its name: any split day whose muscle list includes Quads, Hamstrings, Glutes, or Calves, or on which you prescribe a squat, deadlift, lunge, or leg-press pattern top set. The quality session (qualityDay) must NEVER be a lower-body day — speed work does not share a day with heavy legs. Lower-body days may only ever receive easy running. easyDays lists the remaining run days (may repeat strength-day names); easyMinutes is the duration of each easy run.
- Do not schedule the quality session the day immediately before or after the long run when avoidable.
- longRunPace and easyPace are ranges like "9:05–9:45/mi" anchored to logged data.
- If there is no endurance goal or no logged running, set mileage/longRunMiles to 0, quality to "No goal-driven cardio", and empty placement fields.

GENERAL
- Generate exactly the number of weeks requested in the context (blockWeeks, normally 8). The athlete's app regenerates the next block from their logs, so plan THIS block concretely rather than hedging toward the far future.
- If the earliest goal deadline falls inside this block, the final weeks taper (if racing) or peak (if strength testing).
- note: one short sentence on what that week accomplishes. summary: 2-3 sentences describing the program's arc, referencing the athlete's actual numbers.
- Every number must be consistent with the athlete's supplied data. Never invent exercises or split days not supplied.`;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Authentication required.');
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error('Authentication required.');
    const body = await request.json();
    /* Cooldown: a block was just generated — refuse rapid regeneration so a
       stuck client or refresh-mashing cannot burn provider credits. */
    const { data: existingPlan } = await userClient.from('training_plans').select('generated_at').maybeSingle();
    if (existingPlan?.generated_at && Date.now() - new Date(existingPlan.generated_at).getTime() < 120000) {
      return Response.json({ error: 'Your program was just generated. Wait a couple of minutes before refreshing again.' }, { status: 429, headers: corsHeaders });
    }
    const context = JSON.stringify(body.context || {}).slice(0, 30000);
    const identifierBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userData.user.id));
    const safetyIdentifier = Array.from(new Uint8Array(identifierBytes)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-terra',
        store: false,
        safety_identifier: safetyIdentifier,
        prompt_cache_key: 'forge-plan-v1',
        reasoning: { effort: 'medium' },
        text: { verbosity: 'low', format: { type: 'json_schema', name: 'forge_program', strict: true, schema: planSchema } },
        instructions: planInstructions,
        input: `Build the program from this verified athlete data JSON: ${context}`,
      }),
    });
    if (!aiResponse.ok) throw new Error(`Plan service failed (${aiResponse.status}).`);
    const responseBody = await aiResponse.json();
    const text = outputText(responseBody);
    if (!text) throw new Error('The plan service returned nothing.');
    const plan = JSON.parse(text);
    if (!Array.isArray(plan.weeks) || !plan.weeks.length) throw new Error('The plan service returned no weeks.');
    /* Forge's 8/6/4/2 wave is DETERMINISTIC — for every lift with a logged
       best, reps and weights are computed here, not trusted to the model:
       weeks 1-3 of each 4-week wave express the wave's target max at 8, 6,
       then 4 reps (inverse Epley, rounded to 5); week 4 is the max week — a
       2-rep attempt implying target + 7.5 lb (a 5-10 lb PR attempt). Each
       wave re-anchors to the previous wave's attempt. Lifts with no logged
       best keep the model's prescription. */
    const bests = ((body.context || {}).loggedBests || {}) as Record<string, number>;
    const metric = String((body.context || {}).units || '').toLowerCase() === 'metric';
    const step = metric ? 2.5 : 5;
    const bump = metric ? 3.75 : 7.5;
    const weightFor = (max: number, reps: number) => Math.max(step, Math.ceil(max / (1 + reps / 30) / step) * step);
    const WAVE_REPS = [8, 6, 4, 2];
    /* Every wave anchors to the athlete's CURRENT best — never a projected
       ramp that assumes success. The client recomputes these same numbers
       live as new bests are logged, so a PR raises the wave and a miss holds
       it, and the block regenerates when the baseline is outgrown. */
    plan.weeks.forEach((week: { topSets?: Array<{ exercise: string; weight: number; reps: number }> }, index: number) => {
      const slot = index % 4;
      for (const set of (week.topSets || [])) {
        const logged = Number(bests[set.exercise]) || 0;
        if (!logged) continue;
        set.reps = WAVE_REPS[slot];
        set.weight = slot === 3 ? weightFor(logged + bump, 2) : weightFor(logged, WAVE_REPS[slot]);
      }
    });
    return Response.json({ plan }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Plan generation failed.' }, { status: 400, headers: corsHeaders });
  }
});
