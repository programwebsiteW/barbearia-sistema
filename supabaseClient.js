import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    'Supabase não configurado: crie um arquivo .env baseado em .env.example com a URL e a chave anon do seu projeto.'
  );
}

export const supabase = createClient(url, anonKey);
