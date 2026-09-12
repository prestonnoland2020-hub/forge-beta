/* ONE PHASE VOCABULARY.

   Forge had two. The roadmap spoke Foundation / Build / Specific / Deload /
   Taper / Test; the stored block spoke Base / Build / Peak / Deload / Taper /
   Race. They render on the same screen, so a single week could be called
   "Foundation" above and "Base" below, and the mapping between them lived in
   whichever file last needed it.

   Worse, the two were not even about the same thing. The roadmap's "Test" was
   the LIFTING wave's max week — it came straight off waveSlot().isMax — while
   the block's "Race" was the race. One word, two peaks, on two different
   clocks. Separating them is what makes it possible to notice that a squat max
   and a hard running week have landed in the same seven days.

   So: the phase is about the RUNNING. The lifting wave keeps its own clock and
   is asked about separately. */

export type TrainingPhase = 'Foundation' | 'Build' | 'Specific' | 'Deload' | 'Taper' | 'Race';

/* Legacy stored blocks carry the old words. Read them, never write them. */
const LEGACY: Record<string, TrainingPhase> = {
  Base: 'Foundation', Foundation: 'Foundation',
  Build: 'Build', Development: 'Build',
  Peak: 'Specific', Specific: 'Specific',
  Deload: 'Deload', Recovery: 'Deload',
  Taper: 'Taper',
  Race: 'Race', Test: 'Race',
};
export const normalizePhase = (value: string | undefined): TrainingPhase => LEGACY[String(value || '')] || 'Build';

/* The share of a block spent building an aerobic base before it turns
   race-specific. Short events sharpen sooner; long ones need the base for
   longer, because there is nothing to sharpen without it. Supplied by the
   event profile, defaulted here so a caller with no goal still gets a shape. */
export type PhaseShape = { foundationShare: number; buildShare: number };
export const DEFAULT_SHAPE: PhaseShape = { foundationShare: 0.3, buildShare: 0.4 };

export type PhaseContext = {
  /* Zero-based week within the block. */
  weekIndex: number;
  blockWeeks: number;
  /* Weeks between this week and the race, when there is a dated race. */
  weeksToRace?: number;
  /* Whether the running volume is cut this week — the wave's own deload. */
  deloading?: boolean;
  shape?: PhaseShape;
};

/* A taper is the last two weeks before a race, and race week is race week.
   Both are measured from the RACE, not from the end of the block: a block that
   ends in March cannot taper for an April race, and a block that runs past the
   race must taper inside itself. */
export const TAPER_WEEKS = 2;

export function phaseFor({ weekIndex, blockWeeks, weeksToRace, deloading, shape = DEFAULT_SHAPE }: PhaseContext): TrainingPhase {
  const weeks = Math.max(1, blockWeeks);
  const index = Math.max(0, Math.min(weeks - 1, weekIndex));

  if (typeof weeksToRace === 'number' && weeksToRace >= 0) {
    const away = weeksToRace - index;
    if (away === 0) return 'Race';
    /* AND LIFE GOES ON AFTER THE RACE. "Race week" was anything at or past the
       race date, so a sixteen-week block with the race in week five had eleven
       consecutive race weeks after it — the athlete's plan proposing they race
       a marathon every seven days until the block ran out. The week after is
       recovery; then the next build starts, because that is what actually
       happens next. */
    if (away < 0) return away === -1 ? 'Deload' : 'Foundation';
    if (away <= TAPER_WEEKS) return 'Taper';
  } else if (index === weeks - 1) {
    /* No dated race: the block still ends by freshening rather than by
       stopping mid-climb. */
    return 'Taper';
  }
  /* A cut week is a deload whatever else it would have been — except a taper
     or race week, where the cut IS the plan and calling it a deload turns the
     last sharpening session before a race into a stop-while-fresh fartlek. */
  if (deloading) return 'Deload';

  /* PROGRESS IS MEASURED OVER THE WEEKS THAT ACTUALLY TRAIN, not over the
     whole block. Measured over the block, a twelve-week build with a two-week
     taper and a race week reached the specific phase at week nine — which was
     a deload, followed by the taper. The athlete never did a single week of
     race-specific work, in a plan whose entire purpose was that race. */
  const lastTraining = Math.max(0, (typeof weeksToRace === 'number' && weeksToRace >= 0
    ? Math.min(weeks - 1, weeksToRace - TAPER_WEEKS - 1)
    : weeks - 2));
  const progress = lastTraining > 0 ? Math.min(1, index / lastTraining) : 1;
  if (progress < shape.foundationShare) return 'Foundation';
  if (progress < shape.foundationShare + shape.buildShare) return 'Build';
  return 'Specific';
}
