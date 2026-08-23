"use client";

import React, { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

interface UserMarkerProps {
  position: [number, number];
  address: string;
}

export default function UserMarker({ position, address }: UserMarkerProps) {
  // Memoize custom pulsing blue icon for user location (prevents _Leaflet_pos crash)
  const userIcon = useMemo(() => {
    return L.divIcon({
      className: "custom-leaflet-user-icon",
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
          <div style="width: 16px; height: 16px; background-color: #3b82f6; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.25); position: relative; z-index: 10;"></div>
          <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.4); animation: leaflet-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; top: -4px; left: -4px;"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -10]
    });
  }, []);

  return (
    <Marker position={position} icon={userIcon}>
      <Popup>
        <div style={{ fontFamily: "sans-serif", padding: "2px", color: "#1e293b" }}>
          <h4 style={{ margin: "0 0 6px 0", fontSize: "13px", fontWeight: "600", color: "#3b82f6" }}>Current Location</h4>
          <div style={{ fontSize: "11px", lineHeight: "1.4" }}>
            <strong>Address:</strong> {address || "Loading Address..."}<br/>
            <strong>Coords:</strong> {position[0].toFixed(5)}, {position[1].toFixed(5)}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
