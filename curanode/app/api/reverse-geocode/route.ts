import { NextRequest, NextResponse } from "next/server";

// Server-side in-memory cache to insulate against OSM Nominatim rate limits
const serverCache = new Map<string, string>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Latitude and longitude query parameters are required." },
      { status: 400 }
    );
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) {
    return NextResponse.json(
      { error: "Invalid latitude or longitude format." },
      { status: 400 }
    );
  }

  // Generate cache key rounded to 5 decimal places (~1.1 meter accuracy)
  const cacheKey = `${latitude.toFixed(5)}_${longitude.toFixed(5)}`;
  if (serverCache.has(cacheKey)) {
    console.log(`[Geocoding Server] Cache hit for key: ${cacheKey}`);
    return NextResponse.json({ address: serverCache.get(cacheKey) });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;

  let lastError: any = null;
  const retries = 3;
  const timeoutMs = 5000;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[Geocoding Server] Attempt ${attempt} querying Nominatim OSM API for coordinates: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          // Nominatim requires a descriptive User-Agent
          "User-Agent": "CuraNode-Emergency-Triage-App/1.0 (contact@curanode.com)",
          "Referer": "https://curanode.com"
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check for rate limits or server errors
      if (response.status === 429) {
        throw new Error(`Nominatim rate limit exceeded (HTTP 429)`);
      }
      if (response.status >= 500) {
        throw new Error(`Nominatim server error (HTTP ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(`Nominatim API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const resolvedAddress = data && data.display_name ? data.display_name : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      
      // Store in memory cache
      serverCache.set(cacheKey, resolvedAddress);
      console.log(`[Geocoding Server] Successfully resolved and cached: ${cacheKey}`);

      return NextResponse.json({ address: resolvedAddress });

    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      // Classify error type for detailed log inspection
      if (err.name === "AbortError") {
        console.error(`[Geocoding Server] Attempt ${attempt} timed out after ${timeoutMs}ms (Aborted)`);
      } else if (err.message && err.message.includes("HTTP")) {
        console.error(`[Geocoding Server] Attempt ${attempt} returned status error: ${err.message}`);
      } else {
        console.error(`[Geocoding Server] Attempt ${attempt} failed with network error: ${err.message || String(err)}`);
      }

      // Retry backoff (500ms, 1000ms) - avoid hammer effect on rate limits
      if (attempt < retries) {
        const backoffDelay = attempt * 500;
        console.log(`[Geocoding Server] Backing off for ${backoffDelay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  // Fallback graceful response to prevent client lockups
  console.error(`[Geocoding Server] All ${retries} attempts failed. Returning graceful coordinate address.`);
  const fallbackAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  
  // Cache the fallback coordinate temporary to prevent duplicate queries on failure
  serverCache.set(cacheKey, fallbackAddress);

  return NextResponse.json({ 
    address: fallbackAddress,
    warning: "Geocoding failed, returned coordinate fallback.",
    errorDetails: lastError?.message || String(lastError)
  });
}
