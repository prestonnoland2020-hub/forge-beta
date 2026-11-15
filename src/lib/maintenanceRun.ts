/* RUNNING WITHOUT A RACE, IN ONE PLACE.

   A hybrid athlete with a Run day in the split and no race goal said how much
   they run; Plan and Today both keep that running as an easy run of the same
   length, so the two screens can never disagree about it. Ten minutes a mile
   is a deliberately plain easy pace — the run is set by time, not pace. */
export function maintenanceRunMinutes(weeklyMileage: number, runningDays: number): number {
  if (!(weeklyMileage > 0) || !(runningDays > 0)) return 0;
  const minutes = Math.max(20, Math.min(60, (weeklyMileage / runningDays) * 10));
  return Math.round(minutes / 5) * 5;
}
