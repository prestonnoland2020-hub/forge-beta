import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().default('https://preview.supabase.co'),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).default('preview-anon-key-not-connected'),
  VITE_DEMO_MODE: z.enum(['true', 'false']).default('true'),
});

export const env = envSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE,
});

export const isDemoMode = env.VITE_DEMO_MODE === 'true';
