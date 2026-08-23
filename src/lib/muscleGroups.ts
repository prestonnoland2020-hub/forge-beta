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
