/**
 * CuraNode Frontend API Configuration
 * Centralizes API and WebSocket base URLs across development and production environments.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

/**
 * Returns the dynamic WebSocket URL for real-time telemetry.
 */
export const getWsUrl = (): string => {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = API_BASE_URL.replace(/^https?:\/\//, "");
    return `${protocol}//${host}/ws/ambulances`;
  }
  return "ws://127.0.0.1:8001/ws/ambulances";
};
