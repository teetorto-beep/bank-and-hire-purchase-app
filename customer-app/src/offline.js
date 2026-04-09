/**
 * Offline support for the customer app.
 * Caches account/loan data locally so the app works without internet.
 * Syncs when back online.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const CACHE_PREFIX = "customer_cache_";

export function subscribeToNetwork(onChange) {
  return NetInfo.addEventListener(state => {
    onChange(!!(state.isConnected && state.isInternetReachable));
  });
}

// Cache data locally
export async function cacheData(key, data) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch (_) {}
}

// Read from cache (returns null if not cached)
export async function getCached(key) {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw);
    // Cache valid for 24 hours
    if (Date.now() - cachedAt > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

// Clear all cached data for a customer
export async function clearCache(customerId) {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter(k => k.startsWith(CACHE_PREFIX + customerId));
  if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
}
