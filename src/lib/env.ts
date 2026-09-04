import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().default('https://preview.supabase.co'),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).default('preview-anon-key-not-connected'),
  /* PREVIEW MODE IS OPT-IN. It used to be the default, so any build made
     without a .env — a fresh checkout running `npm run ios:sync`, say —
     silently shipped the fake "Preston" session with nothing saving
     anywhere. Now a build has to ask for preview mode; a real build without
     its Supabase settings fails loudly below instead of pretending. */
  VITE_DEMO_MODE: z.enum(['true', 'false']).default('false'),
});

export const env = envSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE,
});

export const isDemoMode = env.VITE_DEMO_MODE === 'true';

if (!isDemoMode && (env.VITE_SUPABASE_URL === 'https://preview.supabase.co' || env.VITE_SUPABASE_PUBLISHABLE_KEY === 'preview-anon-key-not-connected')) {
  throw new Error('Forge was built without VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Add them to .env (or set VITE_DEMO_MODE=true for a preview build).');
}
