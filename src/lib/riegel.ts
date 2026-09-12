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

