/* HOW ONE RACE RESULT BECOMES ANOTHER, and how much running a pace is built on.

   These two lived inside goalFeasibility, which meant the race predictor could
   not use them without importing the module that imports it. So a prediction
   made in one place got the volume correction and the same prediction made in
   the other did not — that is how Preston's marathon pill read "On track,
   2:37:58" off thirteen miles a week while the banner beside it said the
   volume was not there. One copy, no cycle, both surfaces honest. */
export const RIEGEL = 1.06;
export const RIEGEL_UNDERTRAINED = 1.15;
export const equivalentSeconds = (seconds: number, fromMiles: number, toMiles: number, volumeShortfall = 0) => {
  const stretch = toMiles > fromMiles ? Math.min(1, Math.max(0, volumeShortfall)) : 0;
  return seconds * Math.pow(toMiles / fromMiles, RIEGEL + (RIEGEL_UNDERTRAINED - RIEGEL) * stretch);
};

/* THE WEEKLY VOLUME A RACE PACE IS NORMALLY BUILT ON. Not a law — people break
   it both ways — but the honest middle of it, and enough to tell an athletic
   13-mile-a-week lifter that a sub-19 5K is a volume problem before it is a
   speed problem. Miles per week against goal pace in seconds per mile. */
const VOLUME_FOR_PACE: Array<{ secondsPerMile: number; miles: number }> = [
  { secondsPerMile: 300, miles: 45 },  /* 5:00/mi */
  { secondsPerMile: 330, miles: 35 },  /* 5:30/mi */
  { secondsPerMile: 360, miles: 28 },  /* 6:00/mi */
  { secondsPerMile: 390, miles: 22 },  /* 6:30/mi */
  { secondsPerMile: 420, miles: 16 },  /* 7:00/mi */
  { secondsPerMile: 480, miles: 12 },  /* 8:00/mi */
];
export const volumeForPace = (secondsPerMile: number) => {
  const found = VOLUME_FOR_PACE.find(step => secondsPerMile <= step.secondsPerMile);
  return found ? found.miles : 10;
};


/* THE VOLUME A RACE GOAL IS BUILT ON DEPENDS ON THE RACE, NOT ONLY THE PACE.

   The table above is a 5K table — 6:07/mi is a sub-19 5K — and it was read
   with any goal's pace. So a 4:59 MILE looked up 5:00/mi and was told it
   needs 45 miles a week, a figure for a 15:30 5K; and a 6:00/mi MARATHON was
   told 28, which is not enough to finish one comfortably, let alone at that
   pace. Preston's mile goal kept raising "Build the ramp" to 45 miles for a
   race that is mostly speed.

   So a goal is first carried to the 5K it is worth (the same Riegel curve
   the predictor uses), the 5K table gives the volume, and the distance scales
   it: a mile rests on a smaller aerobic base than a 5K, a marathon on a much
   larger one. */
const FIVE_K_MILES = 3.10686;
const DISTANCE_SCALE: Array<{ upToMiles: number; scale: number }> = [
  { upToMiles: 1.6, scale: 0.7 },   /* mile, 1500m, 2K */
  { upToMiles: 4, scale: 1 },       /* 5K */
  { upToMiles: 7, scale: 1.15 },    /* 10K */
  { upToMiles: 14, scale: 1.4 },    /* half marathon */
  { upToMiles: Infinity, scale: 1.75 }, /* marathon and beyond */
];
export const volumeForRace = (secondsPerMile: number, miles: number) => {
  if (!(miles > 0) || !(secondsPerMile > 0)) return volumeForPace(secondsPerMile);
  const fiveKSeconds = equivalentSeconds(secondsPerMile * miles, miles, FIVE_K_MILES);
  const base = volumeForPace(fiveKSeconds / FIVE_K_MILES);
  const scale = DISTANCE_SCALE.find(step => miles <= step.upToMiles)!.scale;
  return Math.round(base * scale);
};
