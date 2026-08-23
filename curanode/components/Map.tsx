"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { Hospital } from "@/app/page";
import UserMarker from "./UserMarker";
import HospitalMarker from "./HospitalMarker";
import AmbulanceMarker from "./AmbulanceMarker";
import { getOSRMRoute } from "@/lib/routing";

interface MapProps {
  userCoords: { latitude: number; longitude: number } | null;
  userAddress?: string;
  hospitals: Hospital[];
  recommendedHospitals?: Hospital[];
  selectedHospital: Hospital | null;
  onRouteCalculated?: (distance: string, duration: string) => void;
  onHospitalSelect?: (hospital: Hospital) => void;
  onRoutingError?: (errorMsg: string | null) => void;
  dispatchedAmbulance?: any;
  dispatchStatus?: string;
  routeCoords?: [number, number][];
}


// Controller component to handle map centering, zooming, and dynamic fit bounds (Fit ONCE on load, then allow user pan/zoom)
function MapController({
  center,
  selectedHospital,
  dispatchedAmbulance,
  dispatchStatus,
}: {
  center: [number, number];
  selectedHospital: Hospital | null;
  dispatchedAmbulance: any;
  dispatchStatus?: string;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    if (dispatchStatus === "ARRIVED") {
      map.setView(center, 16);
      return;
    }

    // Only fit bounds ONCE on initial route load, respecting user panning/zooming (Req 5 & 18)
    if (hasFittedRef.current) return;

    const points: [number, number][] = [center];

    if (selectedHospital && selectedHospital.latitude && selectedHospital.longitude) {
      points.push([
        typeof selectedHospital.latitude === "string" ? parseFloat(selectedHospital.latitude) : selectedHospital.latitude,
        typeof selectedHospital.longitude === "string" ? parseFloat(selectedHospital.longitude) : selectedHospital.longitude
      ]);
    }

    if (dispatchedAmbulance && dispatchedAmbulance.latitude && dispatchedAmbulance.longitude) {
      points.push([
        typeof dispatchedAmbulance.latitude === "string" ? parseFloat(dispatchedAmbulance.latitude) : dispatchedAmbulance.latitude,
        typeof dispatchedAmbulance.longitude === "string" ? parseFloat(dispatchedAmbulance.longitude) : dispatchedAmbulance.longitude
      ]);
    }

    if (points.length > 1) {
      try {
        map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
        hasFittedRef.current = true;
      } catch (e) {
        console.warn("Fit bounds calculation ignored:", e);
      }
    } else {
      map.setView(center, 14);
    }
  }, [map, center, selectedHospital, dispatchStatus]);

  return null;
}

export default function Map({
  userCoords,
  userAddress,
  hospitals,
  recommendedHospitals,
  selectedHospital,
  onRouteCalculated,
  onHospitalSelect,
  onRoutingError,
  dispatchedAmbulance,
  dispatchStatus,
  routeCoords: routeCoordsProp,
}: MapProps) {
  const [internalRouteCoords, setInternalRouteCoords] = useState<[number, number][]>([]);
  const [routingError, setRoutingError] = useState<string | null>(null);

  // Add ping ring styling keyframes globally inside Map load
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.getElementById("leaflet-ping-keyframes")) {
      const style = document.createElement("style");
      style.id = "leaflet-ping-keyframes";
      style.innerHTML = `
        @keyframes leaflet-ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Query OSRM routing dynamically when coordinates or status changes
  useEffect(() => {
    if (routeCoordsProp !== undefined) return;

    const loadRoute = async () => {
      try {
        setRoutingError(null);
        if (onRoutingError) onRoutingError(null);

        if (!userCoords || userCoords.latitude === undefined || userCoords.longitude === undefined || isNaN(userCoords.latitude) || isNaN(userCoords.longitude)) {
          console.warn("[MAP ROUTING] Aborting route generation: Invalid user GPS coordinates.");
          setInternalRouteCoords([]);
          const msg = "User location coordinates unavailable. Unable to calculate road route.";
          setRoutingError(msg);
          if (onRoutingError) onRoutingError(msg);
          return;
        }

        let startLat = userCoords.latitude;
        let startLon = userCoords.longitude;
        let endLat = 0;
        let endLon = 0;

        const statusUpper = (dispatchStatus || "IDLE").toUpperCase();
        const isDispatched = statusUpper === "DISPATCHED" || statusUpper === "EN ROUTE" || statusUpper === "TRANSPORTING";

        if (isDispatched && dispatchedAmbulance && dispatchedAmbulance.latitude !== undefined && dispatchedAmbulance.longitude !== undefined) {
          const ambLat = typeof dispatchedAmbulance.latitude === "string" 
            ? parseFloat(dispatchedAmbulance.latitude) 
            : dispatchedAmbulance.latitude;
          const ambLon = typeof dispatchedAmbulance.longitude === "string" 
            ? parseFloat(dispatchedAmbulance.longitude) 
            : dispatchedAmbulance.longitude;

          if (!isNaN(ambLat) && !isNaN(ambLon)) {
            startLat = ambLat;
            startLon = ambLon;
            endLat = userCoords.latitude;
            endLon = userCoords.longitude;
          }
        } else if (selectedHospital) {
          if (selectedHospital.latitude === undefined || selectedHospital.longitude === undefined || isNaN(selectedHospital.latitude) || isNaN(selectedHospital.longitude)) {
            console.warn("[MAP ROUTING] Aborting route generation: Selected hospital lacks valid coordinates.");
            setInternalRouteCoords([]);
            return;
          }

          startLat = typeof selectedHospital.latitude === "string" 
            ? parseFloat(selectedHospital.latitude) 
            : selectedHospital.latitude;
          startLon = typeof selectedHospital.longitude === "string" 
            ? parseFloat(selectedHospital.longitude) 
            : selectedHospital.longitude;
          endLat = userCoords.latitude;
          endLon = userCoords.longitude;
        } else {
          setInternalRouteCoords([]);
          return;
        }

        const route = await getOSRMRoute(startLat, startLon, endLat, endLon);
        
        if (route.coordinates && route.coordinates.length > 0) {
          setInternalRouteCoords(route.coordinates);
          if (onRouteCalculated) {
            onRouteCalculated(route.distance, route.duration);
          }
        } else {
          // Generate 25-point interpolated fallback route if OSRM is offline
          const fallbackPoints: [number, number][] = [];
          const steps = 25;
          for (let i = 0; i <= steps; i++) {
            const lat = startLat + (endLat - startLat) * (i / steps);
            const lon = startLon + (endLon - startLon) * (i / steps);
            fallbackPoints.push([lat, lon]);
          }
          setInternalRouteCoords(fallbackPoints);
        }
      } catch (err: any) {
        console.warn("[MAP ROUTING] Failed to calculate road route:", err);
      }
    };

    loadRoute();
  }, [userCoords, selectedHospital, dispatchedAmbulance, dispatchStatus, onRouteCalculated, onRoutingError, routeCoordsProp]);

  const center: [number, number] = userCoords && !isNaN(userCoords.latitude) && !isNaN(userCoords.longitude)
    ? [userCoords.latitude, userCoords.longitude]
    : [12.9716, 77.5946];

  const activeRouteCoords = routeCoordsProp !== undefined ? routeCoordsProp : internalRouteCoords;

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-inner relative border border-white/5">
      {routingError && (
        <div className="absolute top-3 left-3 right-3 bg-red-950/90 border border-red-500/50 text-red-200 text-xs p-3 rounded-lg z-20 backdrop-blur-md shadow-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">⚠️</span>
            <span className="font-semibold">{routingError}</span>
          </div>
          <button 
            onClick={() => setRoutingError(null)}
            className="text-red-400 hover:text-white font-bold ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      <MapContainer
        key="stable-leaflet-map"
        center={center}
        zoom={14}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController 
          center={center} 
          selectedHospital={selectedHospital} 
          dispatchedAmbulance={dispatchedAmbulance} 
          dispatchStatus={dispatchStatus} 
        />

        <UserMarker position={center} address={userAddress || "Patient Coordinates"} />

        {hospitals.map((hospital) => {
          const recs = recommendedHospitals || [];
          const recommendedIdx = recs.findIndex((r) => r.id === hospital.id);

          const isRecommended = recommendedIdx !== -1;
          const rank = isRecommended ? recommendedIdx + 1 : undefined;

          return (
            <HospitalMarker
              key={hospital.id}
              hospital={hospital}
              isRecommended={isRecommended}
              rank={rank}
              onSelect={(h) => {
                if (onHospitalSelect) {
                  onHospitalSelect(h);
                }
              }}
            />
          );
        })}

        {dispatchedAmbulance && (
          <AmbulanceMarker
            key={dispatchedAmbulance.id}
            ambulance={{
              id: dispatchedAmbulance.id,
              number: dispatchedAmbulance.number || "AMB-204",
              status: dispatchStatus || dispatchedAmbulance.status || "DISPATCHED",
              latitude: typeof dispatchedAmbulance.latitude === "string" 
                ? parseFloat(dispatchedAmbulance.latitude) 
                : dispatchedAmbulance.latitude,
              longitude: typeof dispatchedAmbulance.longitude === "string" 
                ? parseFloat(dispatchedAmbulance.longitude) 
                : dispatchedAmbulance.longitude,
              eta: dispatchedAmbulance.eta
            }}
          />
        )}

        {activeRouteCoords.length > 0 && (
          <Polyline
            positions={activeRouteCoords}
            color="#19B5B1"
            weight={5}
            opacity={0.9}
          />
        )}

      </MapContainer>
    </div>
  );
}