"use client";

import React, { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Hospital } from "@/app/page";

interface HospitalMarkerProps {
  hospital: Hospital;
  isRecommended: boolean;
  rank?: number;
  onSelect: (hospital: Hospital) => void;
}

export default function HospitalMarker({
  hospital,
  isRecommended,
  rank,
  onSelect,
}: HospitalMarkerProps) {
  // Highlight recommended hospitals with Gold (#d4af37), Silver (#a6a6a6), and Bronze (#cd7f32) pins
  const pinColor = isRecommended
    ? rank === 1 ? "#d4af37" // Gold
    : rank === 2 ? "#a6a6a6" // Silver
    : "#cd7f32" // Bronze
    : "#f43f5e"; // Default Rose Red

  const textColor = isRecommended && rank === 3 ? "#1e293b" : "#ffffff";

  // Memoize hospitalIcon so it is NOT re-created on every render tick (prevents _Leaflet_pos crash)
  const hospitalIcon = useMemo(() => {
    return L.divIcon({
      className: "custom-leaflet-hospital-icon",
      html: `
        <div style="
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background-color: ${pinColor};
          color: ${textColor};
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 11px;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.25);
          cursor: pointer;
        ">
          ${isRecommended ? `#${rank}` : `
            <svg style="width: 12px; height: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m-8-8h16"></path>
            </svg>
          `}
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -10]
    });
  }, [pinColor, textColor, isRecommended, rank]);

  const position: [number, number] = [
    typeof hospital.latitude === "string" ? parseFloat(hospital.latitude) : hospital.latitude,
    typeof hospital.longitude === "string" ? parseFloat(hospital.longitude) : hospital.longitude
  ];

  return (
    <Marker position={position} icon={hospitalIcon}>
      <Popup>
        <div style={{ fontFamily: "sans-serif", padding: "4px", minWidth: "180px" }}>
          <div style={{ fontWeight: "bold", fontSize: "13px", color: "#0f172a", marginBottom: "2px" }}>
            {hospital.name}
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>
            {hospital.city}, {hospital.state}
          </div>
          
          <div style={{ fontSize: "11px", lineHeight: "1.5", marginBottom: "8px", borderTop: "1px solid #e2e8f0", paddingTop: "6px" }}>
            <div>🏥 <strong>ICU Beds:</strong> {hospital.icu_beds ?? hospital.available_beds} available</div>
            <div>⚡ <strong>Rating:</strong> ⭐ {hospital.rating || 4.8}</div>
            {hospital.estimated_travel_time && <div>🚗 <strong>Travel Time:</strong> {hospital.estimated_travel_time} mins</div>}
          </div>

          <button
            onClick={() => onSelect(hospital)}
            style={{
              width: "100%",
              padding: "6px 12px",
              backgroundColor: "#19B5B1",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              fontSize: "11px",
              cursor: "pointer"
            }}
          >
            Dispatch to {hospital.name.split(" ")[0]}
          </button>
        </div>
      </Popup>
    </Marker>
  );
}
