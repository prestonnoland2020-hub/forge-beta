import { createContext,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';

export type AppearanceSettings={preset:'forge'|'focus'|'endurance'|'power'|'custom';accent:'volt'|'ice'|'ocean'|'ember'|'violet'|'gold';surface:'midnight'|'graphite'|'deep-navy'|'carbon'|'light';type:'forge'|'modern'|'technical';atmosphere:'solid'|'glow'|'grid';compact:boolean;motion:boolean};
const defaults:AppearanceSettings={preset:'forge',accent:'volt',surface:'midnight',type:'forge',atmosphere:'solid',compact:false,motion:true};
type Preset=Exclude<AppearanceSettings['preset'],'custom'>;
const presetSettings:Record<Preset,Partial<AppearanceSettings>>={forge:{accent:'volt',surface:'midnight',type:'forge',atmosphere:'solid',compact:false},focus:{accent:'ice',surface:'carbon',type:'modern',atmosphere:'solid',compact:true},endurance:{accent:'ocean',surface:'deep-navy',type:'modern',atmosphere:'glow',compact:false},power:{accent:'ember',surface:'graphite',type:'forge',atmosphere:'glow',compact:false}};
type AppearanceContextValue={settings:AppearanceSettings;update:(changes:Partial<AppearanceSettings>)=>void;applyPreset:(preset:Preset)=>void;reset:()=>void};
const AppearanceContext=createContext<AppearanceContextValue|null>(null);
const storageKey='forge-appearance-v1';
function readSettings(){try{return {...defaults,...JSON.parse(localStorage.getItem(storageKey)||'{}')} as AppearanceSettings}catch{return defaults}}
function applyToRoot(settings:AppearanceSettings){const root=document.documentElement;root.dataset.accent=settings.accent;root.dataset.surface=settings.surface==='light'?'midnight':settings.surface;root.dataset.mode=settings.surface==='light'?'light':'dark';root.dataset.type=settings.type;root.dataset.atmosphere=settings.atmosphere;root.dataset.compact=String(settings.compact);root.dataset.motion=String(settings.motion)}
export function AppearanceProvider({children}:{children:ReactNode}){
  const [settings,setSettings]=useState<AppearanceSettings>(readSettings);
  useEffect(()=>{applyToRoot(settings);localStorage.setItem(storageKey,JSON.stringify(settings))},[settings]);
  useEffect(()=>{const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#09100e"/><circle cx="64" cy="64" r="39" fill="none" stroke="#d7ff45" stroke-width="8"/><path d="M28 64h20m32 0h20M48 57v14m32-14v14M48 64h32" stroke="#d7ff45" stroke-width="8" stroke-linecap="round"/></svg>';const href=`data:image/svg+xml,${encodeURIComponent(svg)}`;for(const rel of ['icon','apple-touch-icon']){let link=document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);if(!link){link=document.createElement('link');link.rel=rel;document.head.appendChild(link)}link.href=href}},[]);
  const value=useMemo(()=>({settings,update:(changes:Partial<AppearanceSettings>)=>setSettings(current=>({...current,...changes,preset:'custom'})),applyPreset:(preset:Preset)=>setSettings(current=>({...current,...presetSettings[preset],preset})),reset:()=>setSettings(defaults)}),[settings]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}
export function useAppearance(){const value=useContext(AppearanceContext);if(!value)throw new Error('useAppearance must be used inside AppearanceProvider');return value}
