import { supabase } from '../../lib/supabase';
import { isRestDay } from './aiPlanService';
import type { DailyRecommendation, RecommendationSplitDay } from '../../lib/dailyRecommendationEngine';

export type CycleSnapshot={splitId?:string;nextPosition:number;revision:number;days:RecommendationSplitDay[]};

export async function loadCycleSnapshot(ownerId:string):Promise<CycleSnapshot>{
  const {data:split,error:splitError}=await supabase.from('training_splits').select('id,name,training_split_days(id,position,name,muscle_groups,goal_lifts,cardio_types)').eq('owner_id',ownerId).eq('is_active',true).maybeSingle();
  if(splitError)throw splitError;
  if(!split)return{nextPosition:1,revision:0,days:[]};
  const {data:state,error:stateError}=await supabase.from('training_cycle_state').select('next_position,revision,split_id').eq('owner_id',ownerId).maybeSingle();
  if(stateError)throw stateError;
  const days=[...((split as {training_split_days?:Array<{id:string;position:number;name:string;muscle_groups:string[];goal_lifts:string[];cardio_types:string[]}>}).training_split_days||[])].sort((a,b)=>a.position-b.position).map(day=>{
    const muscles=day.muscle_groups||[];const exercises=day.goal_lifts||[];const cardioTypes=day.cardio_types||[];const hasStrength=muscles.length>0||exercises.length>0;const hasCardio=cardioTypes.length>0;
        /* WHAT THE ATHLETE CALLED IT WINS. Derived purely from content, a day
       named "Rest" that also permitted cardio came back as a CARDIO day here
       while the Plan tab read it as rest — so the week's miles were divided
       across a different number of days on each screen. `isRestDay` is the
       one definition. */
    const name=day.name||`Day ${day.position}`;
    const type=isRestDay({name})?'rest':hasStrength&&hasCardio?'mixed':hasStrength?'strength':hasCardio?'cardio':'rest';
    return{id:day.id,splitId:String(split.id),position:day.position,name,type,muscles,exercises,cardioTypes} as RecommendationSplitDay;
  });
  const matchesSplit=state?.split_id===split.id;
  return{splitId:String(split.id),nextPosition:matchesSplit?Number(state?.next_position||days[0]?.position||1):(days[0]?.position||1),revision:matchesSplit?Number(state?.revision||0):0,days};
}

export async function loadDailyRecommendation(ownerId:string,date:string):Promise<DailyRecommendation|null>{
  const {data,error}=await supabase.from('daily_recommendations').select('id,status,recommendation').eq('owner_id',ownerId).eq('recommendation_date',date).maybeSingle();
  if(error)throw error;
  if(!data?.recommendation)return null;
  return{...(data.recommendation as DailyRecommendation),id:String(data.id),status:data.status as DailyRecommendation['status']};
}

export async function saveDailyRecommendation(ownerId:string,recommendation:DailyRecommendation):Promise<DailyRecommendation>{
  void ownerId;
  const rowPayload={recommendationDate:recommendation.date,splitId:recommendation.splitDay.splitId||'',splitDayId:recommendation.splitDay.id||'',splitPosition:recommendation.splitDay.position,status:recommendation.status,algorithmVersion:recommendation.algorithmVersion,inputFingerprint:recommendation.inputFingerprint,recommendation,selectedTopSetIds:recommendation.topSets.filter(set=>set.selected).map(set=>set.id)};
  const {data,error}=await supabase.rpc('save_my_daily_recommendation',{row_payload:rowPayload});
  if(error)throw error;
  const saved=data as {id:string;status:DailyRecommendation['status'];recommendation:DailyRecommendation};
  return{...saved.recommendation,id:String(saved.id),status:saved.status};
}
