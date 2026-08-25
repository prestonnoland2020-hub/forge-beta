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

STRENGTH RULES
- Every strength or mixed split day that has mapped exercises gets exactly one top-set prescription per week, using ONLY exercises from that day's mapped list. Use the day's exact name in splitDay.
- Loads must TREND UPWARD week over week toward the strength goal — the athlete gets stronger, never weaker. Deload weeks may drop volume/intensity ~7-10% once every 4th week, then the next week resumes ABOVE the pre-deload load.
- WEEK 1 BASELINE: for each lift, the implied estimated max (weight × (1 + reps/30)) must be AT OR ABOVE the athlete's logged best implied max for that lift — convert their best to the prescribed rep count (logged 405×8 ≈ 513 max → a 6-rep prescription opens at ~425, never 405). Progress ~0.5-1.5% per week on big lifts. Round to 5 lb.
- Rep targets may wave (e.g. 8s early, 5-6s mid, 3s late for a 1RM goal) but the estimated max implied by weight×reps must rise steadily toward the goal by its deadline. Never prescribe a set implying a LOWER max than the previous non-deload week.

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
    /* Deterministic guarantee — "stronger, never weaker" is enforced in code,
       not left to the model: every prescription's implied max is floored at the
       athlete's logged best for that lift, and each non-deload week must edge
       past the previous non-deload week. Deloads may dip ~8%. */
    const bests = ((body.context || {}).loggedBests || {}) as Record<string, number>;
    const implied = (weight: number, reps: number) => weight * (1 + reps / 30);
    const weightFor = (max: number, reps: number) => Math.max(5, Math.ceil(max / (1 + reps / 30) / 5) * 5);
    const lastMax: Record<string, number> = {};
    for (const week of plan.weeks) {
      const deload = week.phase === 'Deload' || week.phase === 'Taper';
      for (const set of (week.topSets || [])) {
        const logged = Number(bests[set.exercise]) || 0;
        const previous = lastMax[set.exercise] || 0;
        const floor = Math.max(logged, previous) * (deload ? 0.92 : previous ? 1.004 : 1);
        if (floor && implied(set.weight, set.reps) < floor) set.weight = weightFor(floor, set.reps);
        if (!deload) lastMax[set.exercise] = Math.max(previous, implied(set.weight, set.reps));
      }
    }
    return Response.json({ plan }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Plan generation failed.' }, { status: 400, headers: corsHeaders });
  }
});
