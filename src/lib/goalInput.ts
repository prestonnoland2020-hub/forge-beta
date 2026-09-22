/* WHAT A GOAL FIELD ACCEPTS. The builder took anything: "315 lbs!!" became
   the goal "315 lbs!! lb Squat", and a 5K target typed as "22" was read as
   22 minutes by one parser and 22 seconds by another, which is how a Today
   card came to prescribe 400 m repeats "in 0:02". Every value is normalised
   here, once, before it is stored — numbers are numbers, and a time is a clock. */

export const isTimeUnit = (unit: string) => /mm:ss/i.test(unit);
export const isPaceMetric = (metric: string) => /pace/i.test(metric);

const pad = (n: number) => String(n).padStart(2, '0');
export const secondsToClock = (total: number, hoursFirst = false) => {
  const seconds = Math.max(0, Math.round(total));
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  if (hoursFirst || h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
};

export type GoalValueResult = { ok: true; value: string } | { ok: false; message: string };

/* A time: "22:30", "1:20:00", or a bare number of MINUTES ("22", "22.5").
   With an hh:mm:ss unit a two-part clock reads as h:mm, the way the rest of
   Forge reads it. The result is always a clock. */
export function normalizeTimeValue(raw: string, hoursFirst = false): GoalValueResult {
  const text = raw.trim().replace(/\s+/g, '');
  if (!text) return { ok: false, message: 'Enter a time.' };
  const clock = text.match(/^(\d{1,3})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (clock) {
    const parts = [clock[1], clock[2], clock[3]].filter(part => part !== undefined).map(Number);
    if (parts.slice(1).some(part => part >= 60)) return { ok: false, message: 'Seconds and minutes run 0–59 — e.g. 22:30.' };
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = hoursFirst ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
    else seconds = parts[0] * 60;
    if (!(seconds > 0)) return { ok: false, message: 'A time has to be more than zero.' };
    return { ok: true, value: secondsToClock(seconds, hoursFirst) };
  }
  const decimal = Number(text.replace(/[^\d.]/g, ''));
  if (/^[\d.]+$/.test(text) && Number.isFinite(decimal) && decimal > 0) return { ok: true, value: secondsToClock(decimal * 60, hoursFirst) };
  return { ok: false, message: 'Minutes and seconds — e.g. 22:30, or 22 for 22 minutes.' };
}

/* A number: "315", "315.5", "1,200". Units and words are not accepted — the
   unit is its own field. */
export function normalizeNumberValue(raw: string): GoalValueResult {
  const text = raw.trim().replace(/,/g, '');
  if (!text) return { ok: false, message: 'Enter a number.' };
  if (!/^\d*\.?\d+$/.test(text)) return { ok: false, message: 'Numbers only — e.g. 315. The unit is the next field.' };
  const value = Number(text);
  if (!(value > 0)) return { ok: false, message: 'Has to be more than zero.' };
  return { ok: true, value: String(value) };
}

export function normalizeGoalValue(raw: string, unit: string, metric = ''): GoalValueResult {
  if (isTimeUnit(unit) || isPaceMetric(metric)) return normalizeTimeValue(raw, /hh:mm:ss/i.test(unit));
  return normalizeNumberValue(raw);
}
