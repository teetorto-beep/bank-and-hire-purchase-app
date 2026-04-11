import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://gwuhyjfqpdyyptlldtnb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_p5e3RAcom9Kt0MS6rKkXyg_uVyjh60u';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-client-info': 'collector-app' },
  },
  realtime: {
    timeout: 30000,
    params: { eventsPerSecond: 2 },
  },
});
