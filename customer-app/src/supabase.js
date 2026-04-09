import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
export const supabase = createClient(
  "https://gwuhyjfqpdyyptlldtnb.supabase.co",
  "sb_publishable_p5e3RAcom9Kt0MS6rKkXyg_uVyjh60u",
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true } }
);
