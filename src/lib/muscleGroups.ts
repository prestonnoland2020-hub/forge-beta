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
