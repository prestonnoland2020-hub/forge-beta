import { supabase } from '../../lib/supabase';
import { calculateEstimatedOneRepMax } from '../../lib/strength';
import { resolveTopSetMuscle } from '../../lib/liftMuscles';
import type { CardioLogDraft } from '../../lib/cardioSession';
import type { WorkoutRecord } from './WorkoutHistoryProvider';

type DayRow={id:string;workout_date:string;title:string;muscle_groups:string[];notes:string;body_weight:number|null;effort:string|null;recommendation_id:string|null;split_id:string|null;split_day_id:string|null;split_position:number|null;top_sets:Array<{id:string;recommendation_top_set_id:string|null;muscle_group:string;lift_name:string;weight:number;reps:number;calculated_max:number|null;position:number}>;cardio_sessions:Array<{id:string;structure:string;activity:string;summary:string;prescription_snapshot:CardioLogDraft|null}>};

export async function loadWorkoutHistory():Promise<WorkoutRecord[]>{
  const {data,error}=await supabase.from('workout_days').select('id,workout_date,title,muscle_groups,notes,body_weight,effort,recommendation_id,split_id,split_day_id,split_position,top_sets(id,recommendation_top_set_id,muscle_group,lift_name,weight,reps,calculated_max,position),cardio_sessions(id,structure,activity,summary,prescription_snapshot)').order('workout_date',{ascending:false});
  if(error)throw error;
  return ((data||[]) as DayRow[]).map(day=>{const seen=new Set<string>();const topSets=[...(day.top_sets||[])].sort((a,b)=>a.position-b.position).filter(set=>{const key=`${set.muscle_group.trim().toLowerCase()}|${set.lift_name.trim().toLowerCase()}|${Number(set.weight)}|${Number(set.reps)}`;if(seen.has(key))return false;seen.add(key);return true}).map(set=>({id:set.id,recommendationTopSetId:set.recommendation_top_set_id||undefined,muscle:resolveTopSetMuscle(set.muscle_group,set.lift_name,day.muscle_groups||[]),lift:set.lift_name,weight:Number(set.weight),reps:Number(set.reps),
    /* Every imported set landed with a null calculated_max, which left the
       strength insight with nothing to plot. Epley is deterministic, so it can
       be recomputed on read instead of backfilled destructively. */
    calculatedMax:set.calculated_max===null?(calculateEstimatedOneRepMax(Number(set.weight),Number(set.reps))??undefined):Number(set.calculated_max),completed:true}));const cardioSessions=(day.cardio_sessions||[]).map(session=>session.prescription_snapshot?{...session.prescription_snapshot,id:session.id,structure:session.structure as CardioLogDraft['structure'],activity:session.activity,summary:session.summary}:{id:session.id,structure:session.structure as CardioLogDraft['structure'],activity:session.activity,summary:session.summary,prescription:{}});const first=topSets[0];return{id:day.id,date:day.workout_date,title:day.title,muscles:day.muscle_groups||[],topSets:topSets.length?topSets:undefined,lift:first?.lift,weight:first?.weight,reps:first?.reps,calculatedMax:first?.calculatedMax,hasCardio:cardioSessions.length>0,cardioSessions:cardioSessions.length?cardioSessions:undefined,effort:day.effort||undefined,notes:day.notes||undefined,bodyWeight:day.body_weight===null?undefined:Number(day.body_weight),recommendationId:day.recommendation_id||undefined,splitId:day.split_id||undefined,splitDayId:day.split_day_id||undefined,splitPosition:day.split_position===null?undefined:Number(day.split_position)}});
}

export async function saveWorkoutDay(record:WorkoutRecord):Promise<string>{
  const payload={date:record.date,title:record.title,muscles:record.muscles,notes:record.notes||'',bodyWeight:record.bodyWeight??'',effort:record.effort||'',source:'app',sourceRecordId:record.id,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,recommendationId:record.recommendationId||'',selectedRecommendationTopSetIds:record.selectedRecommendationTopSetIds||[],splitId:record.splitId||'',splitDayId:record.splitDayId||'',splitPosition:record.splitPosition??'',topSets:(record.topSets||[]).filter(set=>set.completed!==false&&set.lift&&set.weight>0&&set.reps>0),cardioSessions:record.cardioSessions||[]};
  const {data,error}=await supabase.rpc('save_my_training_day',{day_payload:payload});
  if(error)throw error;
  return String(data);
}

/* The server's id for a date — for days the client still knows by the id it
   minted before the first save came back. */
export async function findWorkoutDayId(date:string):Promise<string>{
  const {data,error}=await supabase.from('workout_days').select('id').eq('workout_date',date).maybeSingle();
  if(error)throw error;
  if(!data?.id)throw new Error('This day has not reached the server yet — check the sync message and try again.');
  return String(data.id);
}

export async function deleteWorkoutDay(id:string):Promise<void>{
  const {error}=await supabase.rpc('delete_my_training_day',{target_day_id:id});
  if(error)throw error;
}
