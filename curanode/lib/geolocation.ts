export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type GeolocationErrorType = 
  | "GEOLOCATION_NOT_SUPPORTED"
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export class GeolocationError extends Error {
  code: GeolocationErrorType;

  constructor(code: GeolocationErrorType, message: string) {
    super(message);
    this.name = "GeolocationError";
    this.code = code;
  }
}

/**
 * Fetch the user's live coordinates using the browser Geolocation API.
 */
export const getCurrentLocation = (
  options?: PositionOptions
): Promise<Coordinates> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      reject(new GeolocationError("GEOLOCATION_NOT_SUPPORTED", "Browser does not support Geolocation."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new GeolocationError("PERMISSION_DENIED", "User denied the request for Geolocation."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new GeolocationError("POSITION_UNAVAILABLE", "Location information is unavailable."));
            break;
          case error.TIMEOUT:
            reject(new GeolocationError("TIMEOUT", "The request to get user location timed out."));
            break;
          default:
            reject(new GeolocationError("UNKNOWN_ERROR", "An unknown error occurred while retrieving location."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        ...options,
      }
    );
  });
};
