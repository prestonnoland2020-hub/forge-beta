export function calculateEstimatedOneRepMax(weight: number, reps: number) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}
