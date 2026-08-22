import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';

export type CoachingStrategy={loadBiasPercent:number;splitEmphasis:'Balanced'|'Strength'|'Endurance'|'Hybrid';lastAdjustment:string;updatedAt:string|null};
const defaults:CoachingStrategy={loadBiasPercent:0,splitEmphasis:'Balanced',lastAdjustment:'',updatedAt:null};
const storageKey='forge-coaching-strategy-v1';
type Value={strategy:CoachingStrategy;updateStrategy:(change:Partial<CoachingStrategy>)=>void;resetStrategy:()=>void};
const Context=createContext<Value|null>(null);
export function CoachingStrategyProvider({children}:{children:ReactNode}){const [strategy,setStrategy]=useState<CoachingStrategy>(()=>{try{return{...defaults,...JSON.parse(localStorage.getItem(storageKey)||'{}')}}catch{return defaults}});useEffect(()=>localStorage.setItem(storageKey,JSON.stringify(strategy)),[strategy]);const updateStrategy=(change:Partial<CoachingStrategy>)=>setStrategy(current=>({...current,...change,updatedAt:new Date().toISOString()}));const resetStrategy=()=>setStrategy(defaults);return <Context.Provider value={{strategy,updateStrategy,resetStrategy}}>{children}</Context.Provider>}
export function useCoachingStrategy(){const value=useContext(Context);if(!value)throw new Error('Coaching strategy provider missing');return value}
