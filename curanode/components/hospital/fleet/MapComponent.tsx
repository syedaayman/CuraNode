'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Setup custom SVG icons to match the design system
const ambulanceIcon = L.divIcon({
  className: 'custom-leaflet-icon',
  html: `<div style="background-color: #E45B5B; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const incidentIcon = L.divIcon({
  className: 'custom-leaflet-icon',
  html: `<div style="background-color: #EF4444; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const hospitalIcon = L.divIcon({
  className: 'custom-leaflet-icon',
  html: `<div style="background-color: #10B981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function MapUpdater({ centerLat, centerLng }: { centerLat: number, centerLng: number }) {
  const map = useMap();
  
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);
  
  useEffect(() => {
    map.panTo([centerLat, centerLng], { animate: true });
  }, [centerLat, centerLng, map]);
  
  return null;
}

export interface MapComponentProps {
  ambulanceLat: number;
  ambulanceLng: number;
  incidentLat: number | null;
  incidentLng: number | null;
  hospitalLat: number | null;
  hospitalLng: number | null;
  ambulanceId: string;
  incidentId: string;
}

export default function MapComponent({
  ambulanceLat,
  ambulanceLng,
  incidentLat,
  incidentLng,
  hospitalLat,
  hospitalLng,
  ambulanceId,
  incidentId
}: MapComponentProps) {

  const hasIncident = incidentLat !== null && incidentLng !== null;
  const hasHospital = hospitalLat !== null && hospitalLng !== null;

  const positions: [number, number][] = [
    [ambulanceLat, ambulanceLng]
  ];

  if (hasIncident) {
    positions.push([incidentLat, incidentLng]);
  }
  
  if (hasHospital) {
    positions.push([hospitalLat, hospitalLng]);
  }

  return (
    <div className="w-full h-[400px] rounded-2xl overflow-hidden border border-border-light shadow-sm z-0 relative">
      <MapContainer 
        center={[ambulanceLat, ambulanceLng]} 
        zoom={14} 
        style={{ height: '100%', width: '100%', zIndex: 0 }}
      >
        <MapUpdater centerLat={ambulanceLat} centerLng={ambulanceLng} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[ambulanceLat, ambulanceLng]} icon={ambulanceIcon}>
          <Popup className="font-sans font-bold text-text-primary">
            Ambulance {ambulanceId}
          </Popup>
        </Marker>

        {hasIncident && (
          <Marker position={[incidentLat, incidentLng]} icon={incidentIcon}>
            <Popup className="font-sans font-bold text-text-primary">
              Incident #{incidentId.split('-')[0].toUpperCase()}
            </Popup>
          </Marker>
        )}

        {hasHospital && (
          <Marker position={[hospitalLat, hospitalLng]} icon={hospitalIcon}>
            <Popup className="font-sans font-bold text-text-primary">
              Assigned Hospital
            </Popup>
          </Marker>
        )}

        {positions.length > 1 && (
          <Polyline 
            positions={positions} 
            color="#19AFC1" 
            weight={4} 
            opacity={0.8}
            dashArray="10, 10" 
          />
        )}
      </MapContainer>
    </div>
  );
}
