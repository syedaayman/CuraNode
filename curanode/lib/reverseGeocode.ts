/**
 * Reverse geocode latitude and longitude using client-side caching,
 * request deduplication, and graceful fallback coordinates.
 */

// Memory Cache: Cache key "lat_lng" -> Address
const clientCache: Record<string, string | undefined> = {};

// In-Flight Request Deduplication: Cache key "lat_lng" -> Promise<string>
const activeRequests: Record<string, Promise<string> | undefined> = {};

// Current active AbortController to cancel previous obsolete fetches
let activeAbortController: AbortController | null = null;

/**
 * Generates a cache key rounded to 5 decimal places (~1.1 meter accuracy)
 */
const getCacheKey = (lat: number, lng: number): string => {
  return `${lat.toFixed(5)}_${lng.toFixed(5)}`;
};

export const reverseGeocodeCoords = async (
  lat: number,
  lng: number,
  options?: { signal?: AbortSignal }
): Promise<string> => {
  const cacheKey = getCacheKey(lat, lng);

  // 1. Return cached address if coordinates were resolved before
  if (clientCache[cacheKey]) {
    console.log(`[Geocoding Client] Cache hit for coordinates: ${cacheKey}`);
    return clientCache[cacheKey];
  }

  // 2. Share in-flight promise if an identical request is already running
  if (activeRequests[cacheKey]) {
    console.log(`[Geocoding Client] Deduplicating active query for: ${cacheKey}`);
    return activeRequests[cacheKey];
  }

  // 3. Cancel the previous active lookup if it's obsolete
  if (activeAbortController) {
    activeAbortController.abort();
    console.log("[Geocoding Client] Aborted previous obsolete geocoding request.");
  }

  const controller = new AbortController();
  activeAbortController = controller;

  const isBrowser = typeof window !== "undefined";
  const baseUrl = isBrowser ? "" : "http://localhost:3000";
  const url = `${baseUrl}/api/reverse-geocode?lat=${lat}&lng=${lng}`;

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, {
        signal: options?.signal || controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Client API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      if (data.error && !data.address) {
        throw new Error(data.error);
      }

      const addressResult = data.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      
      // Store result in client-side cache
      clientCache[cacheKey] = addressResult;
      return addressResult;

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log(`[Geocoding Client] Request for ${cacheKey} was aborted.`);
        throw err;
      }
      
      console.error(`[Geocoding Client] Failed to geocode coordinates (${cacheKey}):`, err);
      // Graceful fallback to avoid breaking any application layouts
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } finally {
      // Remove promise from active list once complete
      delete activeRequests[cacheKey];
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    }
  })();

  activeRequests[cacheKey] = fetchPromise;
  return fetchPromise;
};
