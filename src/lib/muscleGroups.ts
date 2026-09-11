const canonicalMuscles:Record<string,string>={
  chest:'Chest',back:'Back',shoulders:'Shoulders',quads:'Quads',quadriceps:'Quads',
  hamstrings:'Hamstrings',glutes:'Glutes',biceps:'Biceps',triceps:'Triceps',
  forearms:'Forearms',abs:'Abs',cardio:'Cardio',
};

export function normalizeMuscleGroups(values:unknown):string[]{
  if(!Array.isArray(values))return[];
  const expanded=values.flatMap(value=>String(value||'').split(/[,;+]/)).map(value=>value.trim()).filter(Boolean);
  return [...new Set(expanded.flatMap(value=>{
    const normalized=value.toLowerCase();
    if(normalized==='legs'||normalized==='leg')return['Quads','Hamstrings','Glutes'];
    return[canonicalMuscles[normalized]||value];
  }))];
}

/* Placeholders that live in the muscle_groups column but are not muscles. The
   legacy Google Sheets import wrote "None" on 104 days, which showed up as a
   muscle in the frequency insight. */
const nonMuscleLabels = new Set(['cardio', 'none', 'rest', 'n/a', 'na', '-', '—']);
export const isTrainedMuscle = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && !nonMuscleLabels.has(normalized);
};
export const trainedMuscles = (values: string[] | undefined) => [...new Set((values || []).filter(isTrainedMuscle))];

/* CARDIO IS NOT A MUSCLE SESSION.

   Rowing is tagged Back · Quads · Hamstrings · Glutes, and that is true of the
   movement — it is what lets Forge know a hard row leaves the back tired. It is
   not a back day. Counting it as one inflates every frequency read the athlete
   uses to decide what to train next: row three times in a week and the app
   reports back, quads, hamstrings and glutes trained three times each, so the
   one thing it is supposed to tell them — what has been neglected — is exactly
   what it gets wrong.

   A movement is cardio if its library entry says so, either by kind or by
   carrying Cardio in its muscle list. Both are checked because the two have
   drifted apart before. */
export const isCardioMovement = (exercise?: { kind?: string; muscles?: string[] } | null): boolean =>
  Boolean(exercise && (String(exercise.kind || '').trim().toLowerCase() === 'cardio'
    || (exercise.muscles || []).some(muscle => String(muscle || '').trim().toLowerCase() === 'cardio')));
