import { isDemoMode } from '../../lib/env';
import { supabase } from '../../lib/supabase';
import { isActiveRecovery, type CardioLogDraft } from '../../lib/cardioSession';

const clockSeconds=(value:string)=>{const parts=value.split(':').map(Number);if(parts.some(Number.isNaN))return 0;if(parts.length===2)return parts[0]*60+parts[1];return parts[0]||0};
const minutes=(value:string)=>clockSeconds(value)/60;

export async function saveCardioDrafts(ownerId:string,performedOn:string,drafts:CardioLogDraft[]){
  if(isDemoMode||!drafts.length)return;
  for(const draft of drafts){
    const {data:session,error:sessionError}=await supabase.from('cardio_sessions').insert({owner_id:ownerId,performed_on:performedOn,structure:draft.structure,prescription_snapshot:draft.prescription,client_request_id:draft.id,captured_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}).select('id').single();
    if(sessionError){if(sessionError.code==='23505')continue;throw sessionError}
    const segments:Array<Record<string,unknown>>=[];
    if(draft.structure==='intervals'){
      (draft.intervalActuals||[]).forEach((rep,index)=>{
        segments.push({session_id:session.id,position:segments.length,segment_role:'work',repeat_index:rep.repeatIndex,segment:'Work interval',cardio_type:draft.activity,unit:'miles',distance:Number(rep.distance)||null,time_minutes:minutes(rep.time)||null,pace_minutes:Number(rep.distance)>0?minutes(rep.time)/Number(rep.distance):null,completion_state:rep.completed?'completed':'skipped',entry_source:rep.source});
        segments.push({session_id:session.id,position:segments.length,segment_role:isActiveRecovery(rep.recovery.kind)?'recovery':'rest',repeat_index:rep.repeatIndex,segment:rep.recovery.kind,cardio_type:isActiveRecovery(rep.recovery.kind)?rep.recovery.activity||rep.recovery.kind:'Rest',unit:isActiveRecovery(rep.recovery.kind)?'miles':'seconds',distance:isActiveRecovery(rep.recovery.kind)?Number(rep.recovery.distance)||null:null,time_minutes:minutes(rep.recovery.duration)||null,rest_seconds:!isActiveRecovery(rep.recovery.kind)?clockSeconds(rep.recovery.duration):null,recovery_kind:rep.recovery.kind,completion_state:index===(draft.intervalActuals||[]).length-1&&rep.recovery.duration===''?'skipped':'completed',entry_source:rep.source});
      });
    }else if(draft.structure==='circuit'){
      (draft.circuitStations||[]).forEach((station,index)=>segments.push({session_id:session.id,position:index,segment_role:'station',segment:station.name,cardio_type:station.name,unit:station.unit,reps_or_calories:Number(station.value)||null,rounds:Number(draft.prescription.rounds)||null,completion_state:'completed',entry_source:'manual'}));
    }else{
      segments.push({session_id:session.id,position:0,segment_role:'work',segment:draft.summary,cardio_type:draft.activity,unit:String(draft.prescription.unit||'minutes'),distance:Number(draft.prescription.distance)||null,time_minutes:Number(draft.prescription.duration)||null,completion_state:'completed',entry_source:'manual'});
    }
    if(segments.length){const {error}=await supabase.from('cardio_segments').insert(segments);if(error)throw error}
  }
}
