import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://tbudccbtqyddnvjuxrmx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WuUA9AYe8X3WLHtLeIaqFQ_UPbR66Y6';

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
