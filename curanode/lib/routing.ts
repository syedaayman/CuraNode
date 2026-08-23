export interface RouteResult {
  coordinates: [number, number][]; // Array of [lat, lon] tuples
  distance: string; // e.g. "4.2 km"
  duration: string; // e.g. "8 mins"
  rawDistanceKm: number;
  rawDurationMins: number;
}

/**
 * Fetch driving directions route between two coordinates using the free OSRM API.
 */
export const getOSRMRoute = async (
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<RouteResult> => {
  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM routing server returned status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error("No routes found between selected coordinates.");
    }

    const route = data.routes[0];
    const geojsonCoords = route.geometry.coordinates; // Returns [lon, lat] tuples

    // Map [lon, lat] to Leaflet [lat, lon] tuples
    const coordinates: [number, number][] = geojsonCoords.map(
      (coord: [number, number]) => [coord[1], coord[0]]
    );

    const distanceKm = route.distance / 1000;
    const durationMins = route.duration / 60;

    return {
      coordinates,
      distance: `${distanceKm.toFixed(1)} km`,
      duration: `${Math.round(durationMins)} mins`,
      rawDistanceKm: distanceKm,
      rawDurationMins: durationMins,
    };
  } catch (err) {
    console.error("OSRM routing calculation failed:", err);
    throw err;
  }
};
