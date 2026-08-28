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

const planInstructions = `You are Forge's program builder. Build ONE coherent multi-week training program from the athlete's verified data: their goals, their split (with the exercises they mapped to each day), their maxes, and their actual logged running.

TWO DIFFERENT NUMBERS — NEVER CONFLATE THEM
- context.calcMaxes are CALCULATED maxes: Epley estimates (weight × (1 + reps/30)) derived from the athlete's best logged set at ANY rep count. A 380 calc max usually comes from something like 315 × 6. It is an ESTIMATE. The athlete has NOT held that weight for a single. Call it "calculated max" or "calc max". NEVER write "your logged 380 lb bench", "your 380 lb best", or anything else that claims they lifted it.
- context.realOneRepMaxes are REAL one-rep maxes: weights actually logged for a set of exactly 1 rep. Only these are true PRs, and only these can register against a Real 1RM strength goal. A lift missing from this object has no real single on record yet.
- THE WHOLE POINT OF THE BLOCK is to convert the calculated max into a real one. Weeks 1-4 train at loads the calc max says the athlete can already handle; MAX WEEK cashes that estimate in as an actual single. Once a single is logged it raises the calc max, and the next wave anchors higher. Say this plainly when you describe the block.

STRENGTH RULES — THE 8/6/4/2/1 WAVE (Forge's fixed progression system)
- Every strength or mixed split day that has mapped exercises gets exactly one top-set prescription per week, using ONLY exercises from that day's mapped list. Use the day's exact name in splitDay.
- THE GOAL LIFT OWNS ITS DAY. If a day's mapped list contains a lift named in context.goalLifts, THAT lift is the day's prescription every single week — not an accessory or machine variation of it. A Squat goal is trained and tested with squats; prescribing hack squat or smith machine squat on that day means the goal lift never gets waved and never gets tested on max week, which defeats the block. Only a day with NO goal lift mapped picks freely from its list.
- Reps cycle in 5-WEEK waves: week 1 = 8 reps, week 2 = 6, week 3 = 4, week 4 = 2, week 5 = MAX WEEK.
- Weeks 1-4: weight = the athlete's current CALCULATED max converted to that rep count by inverse Epley (weight = max / (1 + reps/30)), rounded — the same calculated max expressed across 8s, 6s, 4s, and 2s.
- MAX WEEK IS TIED TO GOALS, WITH NO EXCEPTIONS. A tested single exists for exactly one reason: to move a Real 1RM goal forward. ONLY a lift named in context.goalLifts takes one. It gets a 1-rep attempt 5-10 lb above its real 1RM (context.realOneRepMaxes when present); with no real single on record the attempt sits just under the calculated max.
- Every OTHER lift on max week stays at 2 reps — the heavy double it already earned. Do not offer it an optional single, a "if you're fresh" max, or any other 1-rep work. A day with no goal lift mapped to it simply prescribes one of that day's mapped exercises at the week's rep count. If context.goalLifts is empty, NOTHING is tested that block.
- Every wave anchors to the athlete's CURRENT calculated max — a new wave only rises once a heavier set is actually logged. Never prescribe a set implying a max below the calculated max.\n- Use the athlete's unit system (context.units): pounds in 5 lb steps, or kilograms in 2.5 kg steps; running in miles and /mi pace, or kilometers and /km pace.

RUNNING RULES
- Scale weekly mileage from the athlete's CURRENT logged weekly volume toward what the endurance goal requires, growing at most ~8-10% per week, within the athlete's stated min/max weekly mileage. Schedule the running DELOAD (~20% mileage cut) on each wave's 2-REP week (weeks 4, 9, …) so MAX WEEK always follows a lighter week and the athlete attempts the PR fresh.
- The athlete runs exactly their stated running days per week. One long run (25-35% of the week, growing gradually from their current longest), at most one quality session, the rest easy.
- EASY PACE comes from the athlete's LOGGED average easy pace — roughly their logged pace, drifting only slightly faster as fitness builds. Never derive easy pace from goal race pace. Easy runs must be comfortably slower than any race or quality pace.
- Quality sessions progress logically: shorter reps at goal effort early, longer reps and threshold work mid-plan, race-specific work late. State them compactly like "6 × 400 m" with qualityPace like "1:38/rep" or "7:10/mi".
- PLACEMENT: name days using the athlete's exact split-day names. Runs may be placed on ANY split day, including strength days as an easy double, so the athlete hits their stated running days per week. The long run gets its own day (longRunDay) with no other running and ideally light or no lifting.
- A LOWER-BODY DAY is defined by the day's MUSCLES, never its name: any split day whose muscle list includes Quads, Hamstrings, Glutes, or Calves, or on which you prescribe a squat, deadlift, lunge, or leg-press pattern top set. The quality session (qualityDay) must NEVER be a lower-body day — speed work does not share a day with heavy legs. Lower-body days may only ever receive easy running. easyDays lists the remaining run days (may repeat strength-day names); easyMinutes is the duration of each easy run.
- Do not schedule the quality session the day immediately before or after the long run when avoidable.
- longRunPace and easyPace are ranges like "9:05–9:45/mi" anchored to logged data.
- If there is no endurance goal or no logged running, set mileage/longRunMiles to 0, quality to "No goal-driven cardio", and empty placement fields.

GENERAL
- The weeks array MUST contain exactly context.blockWeeks entries — normally 10, which is two complete 5-week waves. Not 8, not 12. Count them before you answer. The athlete's app regenerates the next block from their logs, so plan THIS block concretely rather than hedging toward the far future.
- If the earliest goal deadline falls inside this block, the final weeks taper (if racing) or peak (if strength testing).
- note: one short sentence on what that week accomplishes.
- summary: 2-3 sentences describing the program's arc using the athlete's actual numbers, named precisely per the rule above — "your 380 lb calculated max on bench", never "your logged 380 lb bench". Where a lift has no real single yet, say so and say that max week is their first real attempt at it. Do NOT state how many weeks the block runs; the app displays that.
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
        prompt_cache_key: 'forge-plan-v3',
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
    const context_ = (body.context || {}) as Record<string, unknown>;
    /* CALCULATED maxes (Epley estimates from the best logged set at any rep
       count) drive weeks 1-4; REAL one-rep maxes (actual logged singles)
       anchor the max-week attempt. The two are never interchangeable — the
       block exists to convert the first into the second. Older clients send
       the previous key names. */
    const bests = ((context_.calcMaxes || context_.loggedBests || {})) as Record<string, number>;
    const singles = ((context_.realOneRepMaxes || context_.loggedSingles || {})) as Record<string, number>;
    /* Max week belongs to the lifts the athlete holds a Real 1RM goal on —
       a tested single is the only set that goal can register, and nothing
       else owes one. An empty list means no strength goal exists yet, so
       everything tests rather than nothing ever converting. */
    /* Same alias fold the client uses: a "Squat" goal claims a "Back Squat"
       prescription — one lift, two eras of naming. */
    const LIFT_ALIASES: string[][] = [
      ['squat', 'back squat', 'barbell squat', 'barbell back squat'],
      ['bench', 'bench press', 'barbell bench press', 'flat bench', 'flat bench press'],
      ['deadlift', 'conventional deadlift', 'barbell deadlift'],
      ['standing overhead press', 'overhead press', 'military press', 'strict press', 'ohp'],
      ['pull ups', 'pull-ups', 'pullups', 'pull up', 'pullup'],
      ['smith machine incline bench', 'smith machine incline bench press', 'smith machine incline press'],
    ];
    const aliasKey = new Map<string, string>();
    LIFT_ALIASES.forEach(group => group.forEach(name => aliasKey.set(name, group[0])));
    const liftKey = (name: string) => { const plain = String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); return aliasKey.get(plain) || plain; };
    const goalLifts = new Set((Array.isArray(context_.goalLifts) ? context_.goalLifts : []).map(name => liftKey(String(name))));
    /* NO EXCEPTIONS. A tested single exists only to move a Real 1RM goal.
       No goal on the lift means no attempt — including when the athlete holds
       no strength goals at all, in which case nothing tests and every day
       simply runs its mapped work through the wave. */
    const tests = (exercise: string) => goalLifts.has(liftKey(exercise));
    const metric = String(context_.units || '').toLowerCase() === 'metric';
    const step = metric ? 2.5 : 5;
    const bump = metric ? 3.75 : 7.5;
    const weightFor = (max: number, reps: number) => Math.max(step, Math.ceil(max / (1 + reps / 30) / step) * step);
    const WAVE_REPS = [8, 6, 4, 2, 1];

    /* Block length is NOT left to the model. It has returned 8 weeks against a
       requested 10, which strands the wave mid-cycle and produces a summary
       that promises "two waves" over eight weeks. Short blocks are extended by
       continuing the wave — week i mirrors week i-5, the same wave slot, so
       the deload and max-week rhythm carries — with running volume grown by
       the ratio the model itself established across the first wave. Long
       blocks are truncated. Either way the wave pass below runs afterwards, so
       every strength number in an extended week is computed, not copied. */
    const wanted = Math.max(4, Math.min(16, Math.round(Number(context_.blockWeeks) || 10)));
    const profile = (context_.profile || {}) as Record<string, number>;
    const ceiling = Number(profile.maxWeeklyMileage) || 0;
    const floor_ = Number(profile.minWeeklyMileage) || 0;
    if (plan.weeks.length > wanted) plan.weeks.length = wanted;
    if (plan.weeks.length && plan.weeks.length < wanted) {
      const first = plan.weeks[0];
      const waveEnd = plan.weeks[Math.min(4, plan.weeks.length - 1)];
      const growth = first?.mileage && waveEnd?.mileage ? Math.min(1.35, Math.max(1, waveEnd.mileage / first.mileage)) : 1.08;
      while (plan.weeks.length < wanted) {
        const index = plan.weeks.length;
        const template = plan.weeks[index - 5] || plan.weeks[index - 1];
        const scale = (value: number) => Math.round((Number(value) || 0) * growth * 10) / 10;
        const clamp = (value: number) => {
          if (!value) return 0;
          const high = ceiling ? Math.min(value, ceiling) : value;
          return floor_ ? Math.max(high, floor_) : high;
        };
        plan.weeks.push({
          ...JSON.parse(JSON.stringify(template)),
          week: index + 1,
          mileage: clamp(scale(template.mileage)),
          longRunMiles: scale(template.longRunMiles),
          note: `Wave ${Math.floor(index / 5) + 1} of the block — the same rhythm at the volume this wave has earned.`,
        });
      }
    }
    plan.weeks.forEach((week: { week: number }, index: number) => { week.week = index + 1; });
    /* The model is told not to name the block length; if it does anyway, the
       number it prints is the one it planned, not the one it returned. */
    if (typeof plan.summary === 'string') plan.summary = plan.summary.replace(/\b\d+\s*[-\u2010-\u2015]?\s*week block\b/gi, `${plan.weeks.length}-week block`);
    /* Every wave anchors to the athlete's CURRENT best — never a projected
       ramp that assumes success. The client recomputes these same numbers
       live as new bests are logged, so a PR raises the wave and a miss holds
       it, and the block regenerates when the baseline is outgrown. */
    /* THE GOAL LIFT OWNS ITS DAY — enforced, not requested. The model was
       picking Hack Squat and Smith Machine Squat for the two leg days of an
       athlete whose goal is Squat: the goal gate below then correctly held
       both at a double, and his actual goal lift went untested all block.
       Whenever a day maps a goal lift, that lift IS the day's prescription. */
    const dayGoalLift = new Map<string, string>();
    (Array.isArray(context_.splitDays) ? context_.splitDays : []).forEach(day => {
      const entry = day as { name?: string; exercises?: string[] };
      const match = (entry.exercises || []).find(name => goalLifts.has(liftKey(String(name))));
      if (entry.name && match) dayGoalLift.set(String(entry.name), String(match));
    });
    if (dayGoalLift.size) plan.weeks.forEach((week: { topSets?: Array<{ splitDay: string; exercise: string }> }) => {
      for (const set of (week.topSets || [])) {
        const owner = dayGoalLift.get(set.splitDay);
        if (owner && liftKey(set.exercise) !== liftKey(owner)) set.exercise = owner;
      }
    });
    plan.weeks.forEach((week: { topSets?: Array<{ exercise: string; weight: number; reps: number }> }, index: number) => {
      const slot = index % 5;
      for (const set of (week.topSets || [])) {
        const findByKey = (table: Record<string, number>) => Number(table[set.exercise]) || Number(Object.entries(table).find(([name]) => liftKey(name) === liftKey(set.exercise))?.[1]) || 0;
        const logged = findByKey(bests);
        if (!logged) continue;
        const attempt = slot === 4 && tests(set.exercise);
        set.reps = attempt ? 1 : slot === 4 ? 2 : WAVE_REPS[slot];
        const single = findByKey(singles);
        set.weight = attempt
          ? Math.max(step, Math.ceil((single ? single + bump : (logged + bump) / (1 + 1 / 30)) / step) * step)
          : weightFor(logged, set.reps);
      }
    });
    return Response.json({ plan }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Plan generation failed.' }, { status: 400, headers: corsHeaders });
  }
});
