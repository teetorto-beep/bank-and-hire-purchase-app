import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
export const supabase = createClient(
  "https://tbudccbtqyddnvjuxrmx.supabase.co",
  "sb_publishable_WuUA9AYe8X3WLHtLeIaqFQ_UPbR66Y6",
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true } }
);
