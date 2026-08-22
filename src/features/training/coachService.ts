import { isDemoMode } from '../../lib/env';
import { supabase } from '../../lib/supabase';

export type ForgeCoachRequest = {
  question: string;
  scope: 'goal' | 'today' | 'plan' | 'workout';
  context: Record<string, unknown>;
};

export type ForgeCoachResponse = {
  answer: string;
  source: 'ai' | 'local';
  error?: string;
  workout?: {
    title: string;
    rounds: number;
    roundRestSeconds: number;
    stations: Array<{ name: string; target: string; unit: string; restSeconds: number }>;
  };
};

export function openCoachBubble(prompt = '') {
  window.dispatchEvent(new CustomEvent('forge:open-coach', { detail: { prompt } }));
}

export async function requestForgeCoach(request: ForgeCoachRequest, localFallback: string): Promise<ForgeCoachResponse> {
  // FORGE GO-LIVE: this is the protected client boundary. The provider API
  // key belongs only in the `forge-coach` Edge Function secret store. See
  // FORGE_GO_LIVE.md before switching VITE_DEMO_MODE off.
  if (isDemoMode) return { answer: localFallback, source: 'local', error: 'Forge is running in preview mode.' };
  const { data, error } = await supabase.functions.invoke('forge-coach', { body: request });
  if (error || !data?.answer) {
    let detail='The AI service did not return a response.';
    const response=(error as { context?: Response } | null)?.context;
    if(response){try{const body=await response.clone().json();if(typeof body?.error==='string')detail=body.error}catch{}}
    return { answer: localFallback, source: 'local', error: detail };
  }
  return { answer: String(data.answer), source: 'ai', workout: data.workout };
}
