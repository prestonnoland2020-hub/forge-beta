import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const args=process.argv.slice(2);const option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined};const file=option('--file');const owner=option('--owner');const commit=args.includes('--commit');
if(!file||!owner){console.error('Usage: npm run import:legacy -- --file ./legacy.json --owner USER_UUID [--commit]');process.exit(1)}
const url=process.env.SUPABASE_URL;const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!serviceKey){console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell running this command.');process.exit(1)}
const rawPayload=(await readFile(file,'utf8')).replace(/^\uFEFF/,'').trim();
let payload;
try{payload=JSON.parse(rawPayload)}catch{console.error('The export file is not valid JSON. No data was imported.');process.exit(1)}
const normalizeMuscles=value=>[...new Set((Array.isArray(value)?value:[value]).flatMap(item=>String(item||'').split(/[,;+]/)).map(item=>item.trim()).filter(Boolean).flatMap(item=>/^legs?$/i.test(item)?['Quads','Hamstrings','Glutes']:[item]))];
const canonicalExerciseMuscles={squat:['Quads','Hamstrings','Glutes'],bench:['Chest','Shoulders','Triceps'],'pull ups':['Back','Biceps','Forearms'],'hack squat':['Quads','Glutes'],'smith machine squat':['Quads','Hamstrings','Glutes'],'smith machine shoulder press':['Shoulders','Triceps'],'lat pulldown':['Back','Biceps'],'smith machine incline bench':['Chest','Shoulders','Triceps'],'standing overhead press':['Shoulders','Triceps']};
if(Array.isArray(payload.exercises))payload.exercises=payload.exercises.map(exercise=>({...exercise,muscles:canonicalExerciseMuscles[String(exercise.name||'').trim().toLowerCase()]||normalizeMuscles(exercise.muscles)}));
if(payload.split?.days)payload.split.days=payload.split.days.map(day=>({...day,muscleGroups:normalizeMuscles(day.muscleGroups||day.muscles),cardioTypes:Array.isArray(day.cardioTypes)&&day.cardioTypes.length?day.cardioTypes:day.hasCustomCardio?['Forge']:[]}));
if(Array.isArray(payload.days)){const evidenceDates=new Set([...(payload.topSets||[]),...(payload.cardioSessions||[])].map(item=>item.date));payload.days=payload.days.map(day=>({...day,muscles:normalizeMuscles(day.muscles)})).filter(day=>day.muscles.length||evidenceDates.has(day.date))}
const roundedRepSets=[];
if(Array.isArray(payload.topSets))payload.topSets=payload.topSets.map(set=>{const reps=Number(set.reps);if(!Number.isFinite(reps)||Number.isInteger(reps))return set;const rounded=Math.floor(reps);roundedRepSets.push(`${set.lift||'Unknown lift'} ${set.weight||0} lb × ${reps} → ${rounded}`);return{...set,reps:rounded}});
const counts={days:Array.isArray(payload.days)?payload.days.length:0,topSets:Array.isArray(payload.topSets)?payload.topSets.length:0,cardioSessions:Array.isArray(payload.cardioSessions)?payload.cardioSessions.length:0};
console.log(`Legacy export: ${payload.person||'unknown'} · ${counts.days} days · ${counts.topSets} top sets · ${counts.cardioSessions} cardio sessions`);
if(roundedRepSets.length)console.log(`Legacy fractional reps rounded down: ${roundedRepSets.join('; ')}`);
console.log(commit?'COMMIT MODE: database writes are enabled.':'DRY RUN: nothing will be imported. Add --commit only after reviewing the report.');
const supabase=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const trainingPayload={...payload,version:'forge-legacy-export-v1'};
const {data,error}=await supabase.rpc('import_legacy_training_data',{target_owner:owner,payload:trainingPayload,perform_commit:commit});
if(error){console.error(error.message);process.exit(1)}
console.log(JSON.stringify(data,null,2));
if(Array.isArray(payload.exercises)||Array.isArray(payload.goals)){
  const {data:libraryData,error:libraryError}=await supabase.rpc('import_legacy_library_data',{target_owner:owner,payload,perform_commit:commit});
  if(libraryError){console.error(`Training history imported, but exercises/goals failed: ${libraryError.message}`);process.exit(1)}
  console.log('Exercise and goal import');console.log(JSON.stringify(libraryData,null,2));
}
if(payload.split?.days?.length){
  const splitName=`${payload.person||'Legacy'} imported split`;
  const splitDays=payload.split.days.map((day,index)=>({position:index+1,name:day.name||`Day ${index+1}`,muscle_groups:normalizeMuscles(day.muscleGroups),goal_lifts:Array.isArray(day.goalLifts)?day.goalLifts:[],cardio_types:Array.isArray(day.cardioTypes)?day.cardioTypes:[]}));
  console.log('Split import');console.log(JSON.stringify({dryRun:!commit,name:splitName,days:splitDays},null,2));
  if(commit){
    const {data:matching,error:matchingError}=await supabase.from('training_splits').select('id').eq('owner_id',owner).eq('name',splitName);if(matchingError){console.error(matchingError.message);process.exit(1)}
    for(const saved of matching||[]){const {error:removeError}=await supabase.from('training_splits').delete().eq('id',saved.id);if(removeError){console.error(removeError.message);process.exit(1)}}
    const {error:disableError}=await supabase.from('training_splits').update({is_active:false}).eq('owner_id',owner).eq('is_active',true);if(disableError){console.error(disableError.message);process.exit(1)}
    const {data:newSplit,error:splitError}=await supabase.from('training_splits').insert({owner_id:owner,name:splitName,is_active:true}).select('id').single();if(splitError){console.error(splitError.message);process.exit(1)}
    const {error:daysError}=await supabase.from('training_split_days').insert(splitDays.map(day=>({split_id:newSplit.id,...day})));if(daysError){console.error(daysError.message);process.exit(1)}
  }
}
if(commit){
  const [daysResult,setsResult,cardioResult]=await Promise.all([
    supabase.from('workout_days').select('id,workout_date,body_weight',{count:'exact'}).eq('owner_id',owner),
    supabase.from('top_sets').select('id',{count:'exact',head:true}).eq('owner_id',owner),
    supabase.from('cardio_sessions').select('id',{count:'exact',head:true}).eq('owner_id',owner),
  ]);
  const readError=daysResult.error||setsResult.error||cardioResult.error;if(readError){console.error(`Import committed, but reconciliation read failed: ${readError.message}`);process.exit(1)}
  const expectedDates=new Set([...(payload.days||[]),...(payload.topSets||[]),...(payload.cardioSessions||[])].map(item=>item.date).filter(Boolean));
  const report={expected:{distinctTrainingDays:expectedDates.size,topSets:counts.topSets,cardioSessions:counts.cardioSessions,bodyWeightEntries:(payload.days||[]).filter(day=>Number(day.bodyWeight)>0).length},database:{trainingDays:daysResult.count||0,topSets:setsResult.count||0,cardioSessions:cardioResult.count||0,bodyWeightEntries:(daysResult.data||[]).filter(day=>Number(day.body_weight)>0).length},note:'Database counts include any records that existed before this import. The import-run result above reports only rows added or merged by this run.'};
  console.log('Reconciliation report');console.log(JSON.stringify(report,null,2));
}
