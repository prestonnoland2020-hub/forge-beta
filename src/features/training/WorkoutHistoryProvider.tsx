import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CardioLogDraft } from '../../lib/cardioSession';
import { isDemoMode } from '../../lib/env';
import { useAuth } from '../auth/AuthProvider';
import { deleteWorkoutDay,findWorkoutDayId,loadWorkoutHistory,saveWorkoutDay } from './workoutHistoryService';

export type LoggedTopSet = { id?:string; recommendationTopSetId?:string; muscle:string; lift:string; weight:number; reps:number; calculatedMax?:number; completed?:boolean };
export type WorkoutRecord = { id:string; date:string; title:string; muscles:string[]; topSets?:LoggedTopSet[]; lift?:string; weight?:number; reps?:number; calculatedMax?:number; hasCardio:boolean; cardioSessions?:CardioLogDraft[]; effort?:string; notes?:string; bodyWeight?:number; recommendationId?:string; selectedRecommendationTopSetIds?:string[]; splitId?:string; splitDayId?:string; splitPosition?:number };
const seedRecords:WorkoutRecord[]=[];
type AddResult={ok:true;record:WorkoutRecord}|{ok:false;duplicate:WorkoutRecord};
type UpdateResult={ok:true;record:WorkoutRecord}|{ok:false;missing:true};
type HistoryValue={records:WorkoutRecord[];loading:boolean;syncing:boolean;syncError:string|null;retrySync:()=>void;addRecord:(record:Omit<WorkoutRecord,'id'>)=>AddResult;updateRecord:(id:string,record:Omit<WorkoutRecord,'id'>)=>UpdateResult;deleteRecord:(id:string)=>Promise<boolean>};
const HistoryContext=createContext<HistoryValue|null>(null);
const storageKey='forge-workout-history-v1';
/* THE OUTBOX. Ids of days whose save has not been confirmed by the server —
   in flight, or failed in the gym with no signal. Reopening the app used to
   replace local history with the server's copy wholesale, so a day that never
   made it up was deleted without a word while the banner promised it was
   "still saved on this device". Days in the outbox are merged back over the
   server's list on load and sent again. */
const pendingKey='forge-workout-pending-v1';
const readPending=():string[]=>{try{const saved=JSON.parse(localStorage.getItem(pendingKey)||'[]');return Array.isArray(saved)?saved.filter(id=>typeof id==='string'):[]}catch{return []}};
const writePending=(ids:string[])=>{try{localStorage.setItem(pendingKey,JSON.stringify(ids))}catch{/* full */}};
const isUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const cardioSignature=(sessions:CardioLogDraft[]|undefined)=>JSON.stringify(sessions||[],(key,value)=>key==='id'?undefined:value);
const normalizedTopSets=(record:Partial<WorkoutRecord>):LoggedTopSet[]=>Array.isArray(record.topSets)&&record.topSets.length?record.topSets.filter(set=>set&&set.lift).map(set=>({...set,muscle:set.muscle||record.muscles?.[0]||'Primary',weight:Number(set.weight),reps:Number(set.reps),completed:set.completed!==false})):(record.lift&&record.weight&&record.reps?[{muscle:record.muscles?.[0]||'Primary',lift:record.lift,weight:Number(record.weight),reps:Number(record.reps),calculatedMax:record.calculatedMax,completed:true}]:[]);
const normalizeRecord=<T extends Partial<WorkoutRecord>>(record:T)=>{const topSets=normalizedTopSets(record);const first=topSets[0];return{...record,topSets:topSets.length?topSets:undefined,lift:first?.lift??record.lift,weight:first?.weight??record.weight,reps:first?.reps??record.reps,calculatedMax:first?.calculatedMax??record.calculatedMax}};
const setSignature=(set:LoggedTopSet)=>`${set.muscle}|${set.lift}|${set.weight}|${set.reps}`;
const mergeDay=(existing:WorkoutRecord,incoming:Partial<WorkoutRecord>):WorkoutRecord=>{const incomingSets=normalizedTopSets(incoming);const combinedSets=[...normalizedTopSets(existing)];incomingSets.forEach(set=>{if(!combinedSets.some(saved=>setSignature(saved)===setSignature(set)))combinedSets.push(set)});const cardio=[...(existing.cardioSessions||[])];(incoming.cardioSessions||[]).forEach(session=>{if(!cardio.some(saved=>saved.id===session.id&&cardioSignature([saved])===cardioSignature([session])))cardio.push(session)});const first=combinedSets[0];/* A DAY THAT ALREADY HAS A NAME KEEPS IT. Merging used to hand the title to
   whatever arrived last, so importing a Strava run onto a logged Legs day
   renamed it "Afternoon Run" — the split-day identity replaced by a device
   label. An incoming title only fills a placeholder now. */
const placeholderTitle=(value:string)=>!value||value.startsWith('Top set ·')||value==='Training day'||value==='Imported activity';
const incomingTitle=String(incoming.title||'');const title=!placeholderTitle(existing.title)?existing.title:!placeholderTitle(incomingTitle)?incomingTitle:(existing.title||incomingTitle||'Training day');const selectedRecommendationTopSetIds=[...new Set([...(existing.selectedRecommendationTopSetIds||[]),...(incoming.selectedRecommendationTopSetIds||[])])];return{...existing,...incoming,id:existing.id,date:existing.date,title,muscles:[...new Set([...existing.muscles,...(incoming.muscles||[])])],topSets:combinedSets.length?combinedSets:undefined,lift:first?.lift,weight:first?.weight,reps:first?.reps,calculatedMax:first?.calculatedMax,hasCardio:Boolean(existing.hasCardio||incoming.hasCardio||cardio.length),cardioSessions:cardio.length?cardio:undefined,notes:[existing.notes,incoming.notes].filter((value,index,all)=>value&&all.indexOf(value)===index).join('\n')||undefined,effort:incoming.effort||existing.effort,bodyWeight:incoming.bodyWeight||existing.bodyWeight,selectedRecommendationTopSetIds:selectedRecommendationTopSetIds.length?selectedRecommendationTopSetIds:undefined}};
const consolidateDays=(items:WorkoutRecord[])=>{const days=new Map<string,WorkoutRecord>();items.sort((a,b)=>b.date.localeCompare(a.date)).forEach(record=>{const existing=days.get(record.date);days.set(record.date,existing?mergeDay(existing,record):record)});return [...days.values()].sort((a,b)=>b.date.localeCompare(a.date))};
export function WorkoutHistoryProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [records,setRecords]=useState<WorkoutRecord[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');const migrated=Array.isArray(saved)?saved.filter(item=>item&&typeof item==='object').map((item,index)=>normalizeRecord({...item,id:String(item.id||`migrated-${index}`),date:String(item.date||new Date().toISOString().slice(0,10)),title:String(item.title||'Completed workout'),muscles:Array.isArray(item.muscles)?item.muscles:[],hasCardio:Boolean(item.hasCardio),cardioSessions:Array.isArray(item.cardioSessions)?item.cardioSessions:undefined}) as WorkoutRecord):seedRecords;const consolidated=consolidateDays(migrated);localStorage.setItem(storageKey,JSON.stringify(consolidated));return consolidated}catch{return seedRecords}});
  const [loading,setLoading]=useState(!isDemoMode);const [syncing,setSyncing]=useState(false);const [syncError,setSyncError]=useState<string|null>(null);const syncQueue=useRef<Promise<void>>(Promise.resolve());
  /* THE LIVE LIST, READABLE SYNCHRONOUSLY. addRecord used to merge against the
     `records` captured when the callbacks were memoised, so a Strava import
     that added five days in one loop kept only the last one locally — and a
     set logged later on one of the missing dates rebuilt that day from
     nothing and deleted the run on the server. Every write goes through here. */
  const recordsRef=useRef(records);
  const commit=(next:WorkoutRecord[])=>{recordsRef.current=next;setRecords(next);try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{/* full */}};
  const pendingIds=useRef<Set<string>>(new Set(readPending()));
  const markPending=(id:string,pending:boolean)=>{if(pending)pendingIds.current.add(id);else pendingIds.current.delete(id);writePending([...pendingIds.current]);if(!pendingIds.current.size)setSyncing(false)};
  const persist=(record:WorkoutRecord)=>{if(isDemoMode||!user)return;markPending(record.id,true);setSyncing(true);setSyncError(null);const operation=syncQueue.current.catch(()=>undefined).then(()=>saveWorkoutDay(record)).then(()=>{markPending(record.id,false);setSyncError(null);window.dispatchEvent(new Event('forge-training-cycle-changed'))});syncQueue.current=operation.then(()=>undefined,()=>undefined);void operation.catch(error=>{setSyncError(error instanceof Error?error.message:'Could not sync this training day.');setSyncing(false)})};
  /* Loading merges the outbox over the server's list, then sends it again. */
  const load=async()=>{const remote=await loadWorkoutHistory();const unsent=recordsRef.current.filter(item=>pendingIds.current.has(item.id));const byDate=new Map(remote.map(item=>[item.date,item] as const));unsent.forEach(item=>{const existing=byDate.get(item.date);byDate.set(item.date,existing?mergeDay(existing,item):item)});const merged=[...byDate.values()].sort((a,b)=>b.date.localeCompare(a.date));pendingIds.current=new Set(unsent.map(item=>byDate.get(item.date)?.id||item.id));writePending([...pendingIds.current]);commit(merged);setSyncError(null);merged.filter(item=>pendingIds.current.has(item.id)).forEach(persist)};
  useEffect(()=>{if(isDemoMode||!user){setLoading(false);return}let active=true;setLoading(true);void load().catch(error=>{if(active)setSyncError(error instanceof Error?error.message:'Could not load workout history.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[user]); // eslint-disable-line react-hooks/exhaustive-deps
  const value=useMemo<HistoryValue>(()=>({records,loading,syncing,syncError,retrySync:()=>{const unsent=recordsRef.current.filter(item=>pendingIds.current.has(item.id));if(unsent.length)unsent.forEach(persist);else if(!isDemoMode&&user){setLoading(true);void load().catch(error=>setSyncError(error instanceof Error?error.message:'Could not load workout history.')).finally(()=>setLoading(false))}},addRecord:(draft)=>{
    const current=recordsRef.current;const normalized=normalizeRecord(draft);const sameDay=current.find(item=>item.date===draft.date);const incomingSets=normalizedTopSets(normalized);const duplicate=sameDay&&incomingSets.length>0&&incomingSets.every(set=>normalizedTopSets(sameDay).some(saved=>setSignature(saved)===setSignature(set)))&&!draft.cardioSessions?.length?sameDay:undefined;
    if(duplicate)return {ok:false,duplicate};
    const record=sameDay?mergeDay(sameDay,normalized):({...normalized,id:`day-${draft.date}-${Date.now()}`} as WorkoutRecord);const next=(sameDay?current.map(item=>item.id===sameDay.id?record:item):[record,...current]).sort((a,b)=>b.date.localeCompare(a.date));commit(next);persist(record);return {ok:true,record};
  },updateRecord:(id,draft)=>{
    const current=recordsRef.current;if(!current.some(item=>item.id===id))return {ok:false,missing:true};
    const record={...normalizeRecord(draft),id} as WorkoutRecord;
    const next=current.map(item=>item.id===id?record:item).sort((a,b)=>b.date.localeCompare(a.date));
    commit(next);persist(record);return {ok:true,record};
  },deleteRecord:async(id)=>{const current=recordsRef.current;const target=current.find(item=>item.id===id);if(!target)return false;try{
    /* A day logged this session still carries its client id; the server
       knows it by the uuid it minted on save. Delete by the date, which is
       the day's real identity on both sides. */
    if(!isDemoMode&&user)await deleteWorkoutDay(isUuid(id)?id:await findWorkoutDayId(target.date));
    markPending(id,false);const next=current.filter(item=>item.id!==id);commit(next);setSyncError(null);window.dispatchEvent(new Event('forge-training-cycle-changed'));return true}catch(error){setSyncError(error instanceof Error?error.message:'Could not delete this training day.');return false}
  }}),[records,loading,syncing,syncError,user]); // eslint-disable-line react-hooks/exhaustive-deps
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}
export function useWorkoutHistory(){const value=useContext(HistoryContext);if(!value)throw new Error('Workout history provider missing');return value}
