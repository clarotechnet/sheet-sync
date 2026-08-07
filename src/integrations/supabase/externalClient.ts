// Cliente para Supabase externo (banco de atividades)
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const externalSupabase = createClient(
  url,
  key
);