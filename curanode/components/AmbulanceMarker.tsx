"use client";

import React, { useMemo, useEffect, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

export interface Ambulance {
  id: string;
  number: string;
  status: string;
  latitude: number;
  longitude: number;
  eta?: string;
  speed?: string;
  assignedHospital?: string;
  assignedIncident?: string;
}

interface AmbulanceMarkerProps {
  ambulance: Ambulance;
}

export default function AmbulanceMarker({ ambulance }: AmbulanceMarkerProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const upperStatus = (ambulance.status || "DISPATCHED").toUpperCase();
  const speedText = ambulance.speed || "48 km/h";
  const unitName = ambulance.number || "AMB-204";

  // Memoize L.divIcon so a new icon instance is NOT created on every position tick (fixes _Leaflet_pos crash)
  const ambulanceIcon = useMemo(() => {
    return L.divIcon({
      className: "custom-leaflet-ambulance-icon",
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <!-- 42px round Leaflet ambulance marker -->
          <div style="
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: #ffffff;
            border: 3px solid #19B5B1;
            box-shadow: 0 4px 14px rgba(25, 181, 177, 0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            cursor: pointer;
            transition: transform 0.3s ease;
          ">
            🚑
          </div>
          <!-- Speed & Unit Badge overlay -->
          <div style="
            margin-top: 4px;
            background: rgba(22, 35, 45, 0.92);
            backdrop-filter: blur(4px);
            color: #ffffff;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 10px;
            font-weight: 700;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.2);
            letter-spacing: 0.3px;
          ">
            ${unitName} · <span style="color: #38bdf8;">${speedText}</span>
          </div>
        </div>
      `,
      iconSize: [90, 65],
      iconAnchor: [45, 21],
      popupAnchor: [0, -22]
    });
  }, [unitName, speedText]);

  const position: [number, number] = [ambulance.latitude, ambulance.longitude];

  // Directly update marker setLatLng on stable Leaflet marker instance without DOM node replacement
  useEffect(() => {
    if (markerRef.current && position && !isNaN(position[0]) && !isNaN(position[1])) {
      markerRef.current.setLatLng(position);
    }
  }, [position]);

  return (
    <Marker ref={markerRef} position={position} icon={ambulanceIcon}>
      <Popup>
        <div style={{ fontFamily: "sans-serif", padding: "4px", minWidth: "160px", color: "#16232D" }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#19B5B1", marginBottom: "2px" }}>
            Ambulance Unit {unitName}
          </div>
          <div style={{ fontSize: "11px", lineHeight: "1.5", color: "#6B7780" }}>
            <div><strong>Status:</strong> <span style={{ color: "#22B573", fontWeight: "600" }}>{upperStatus}</span></div>
            {ambulance.eta && <div><strong>ETA:</strong> {ambulance.eta}</div>}
            <div><strong>Speed:</strong> {speedText} <span style={{ fontSize: "9px", opacity: 0.8 }}>(simulated)</span></div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
