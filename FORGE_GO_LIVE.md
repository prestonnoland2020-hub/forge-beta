# Forge AI go-live bookmark

This is the canonical checklist for replacing Forge preview logic with live AI.

## Security boundary

- Never add an OpenAI or other model-provider secret to `VITE_*`, React code, GitHub Pages, or browser storage.
- Store the model API key as a Supabase Edge Function secret.
- The browser calls authenticated Supabase functions; only the function calls the model provider.
- Keep `VITE_DEMO_MODE=true` until the functions, secrets, authentication, validation, and monitoring below are ready.

## Integration points

1. `src/features/training/coachService.ts`
   - Existing live boundary: `supabase.functions.invoke('forge-coach')`.
   - Deploy the `forge-coach` Edge Function and add the server-only model key.
   - Validate answers and preserve the local fallback on failures.

2. `src/components/CardioArsenal.tsx`
   - Current workout generation is a local preview and does not semantically understand free-form instructions.
   - Replace local draft generation with a `forge-workout` Edge Function request.
   - Send session type, time, distance, instructions, goals, calendar-week mileage/completion, long-run completion, history, recovery, fatigue, injury constraints, and available equipment.
   - Regeneration must send the same constraints plus the rejected draft so the model returns a materially different option.

3. `src/pages/CoachPage.tsx`
   - Local regex plan adjustments are preview behavior.
   - Before launch, route free-form creation and adjustment interpretation through the protected Forge service.
   - Continue requiring explicit user confirmation before applying changes.

4. `src/lib/cardioEngine.ts`, `src/lib/longRangePlanEngine.ts`, and `src/lib/trainingIntelligence.ts`
   - These deterministic engines remain authoritative for calculations, safety limits, weekly mileage, one-long-run-per-week rules, and strength prescriptions.
   - AI may choose and explain within those boundaries; it must not invent or silently override them.

## Required structured workout response

The `forge-workout` function must return schema-validated JSON containing:

- workout name and `Cardio` or `Circuit` type;
- session role and stress;
- measurable duration, distance, intervals, recoveries, rounds, and stations;
- placement guidance and rationale;
- honored constraints and excluded movements/equipment;
- source/version metadata for audit and regeneration.

Reject responses that contradict explicit instructions (for example, running after “no running”), exceed weekly mileage, create a second weekly long run, violate injury/equipment constraints, or omit measurable work.

## Launch checklist

- [ ] Create and deploy `forge-coach` Edge Function.
- [ ] Create and deploy `forge-workout` Edge Function.
- [ ] Add the model API key to Supabase Edge Function secrets.
- [ ] Add authentication, rate limiting, timeouts, retries, and safe logging.
- [ ] Add request and response schemas with automated contradiction checks.
- [ ] Add tests for “no running,” “cardio only,” equipment exclusions, weekly mileage, long-run uniqueness, recovery reductions, regenerate, clear, edit, and save.
- [ ] Show `AI generated` only for validated live responses; label fallback output `Preview`.
- [ ] Set `VITE_DEMO_MODE=false` only after production smoke tests pass.
