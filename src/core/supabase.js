import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('⚠️  Supabase env vars not set. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to .env');
}

export const supabase = createClient(url || '', key || '');
