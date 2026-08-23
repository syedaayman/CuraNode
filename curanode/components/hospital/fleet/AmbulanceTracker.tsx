'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';

// Dynamically import the map component so Leaflet doesn't break SSR
const DynamicMap = dynamic(() => import('./MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-slate-50 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 font-bold border border-border-light shadow-sm">
      Initializing Tracking System...
    </div>
  )
});

interface AmbulanceTrackerProps {
  ambulanceId: string;
  incidentId: string;
  onClose: () => void;
}

export default function AmbulanceTracker({ ambulanceId, incidentId, onClose }: AmbulanceTrackerProps) {
  const [loading, setLoading] = useState(true);
  
  // Ref for scrolling
  const trackerRef = useState<HTMLDivElement | null>(null);
  
  // Coordinates
  const [ambulancePos, setAmbulancePos] = useState<{lat: number, lng: number} | null>(null);
  const [incidentPos, setIncidentPos] = useState<{lat: number, lng: number} | null>(null);
  const [hospitalPos, setHospitalPos] = useState<{lat: number, lng: number} | null>(null);
  
  const [incidentStatus, setIncidentStatus] = useState<string>('En Route');
  
  useEffect(() => {
    let isMounted = true;
    let simInterval: NodeJS.Timeout;

    const fetchTrackingData = async () => {
      setLoading(true);
      
      // 1. Fetch Incident Data
      const { data: incData, error: incError } = await supabase
        .from('incidents')
        .select('*')
        .eq('id', incidentId)
        .single();
        
      let finalIncLat = 40.7128; // Default dummy lat (New York)
      let finalIncLng = -74.0060; // Default dummy lng
      let finalStatus = 'En Route';
      let finalHospId = null;
      let finalHospLat = 40.730610; // Dummy hospital
      let finalHospLng = -73.935242;

      if (!incError && incData) {
        finalIncLat = incData.latitude || finalIncLat;
        finalIncLng = incData.longitude || finalIncLng;
        finalStatus = incData.status || 'En Route';
        finalHospId = incData.hospital_id;
      } else {
        console.warn("Incident fetch failed, using fallback coordinates for demonstration.", incError);
      }

      if (isMounted) {
        setIncidentPos({ lat: finalIncLat, lng: finalIncLng });
        setIncidentStatus(finalStatus);
      }

      // 2. Fetch Hospital Data (if applicable)
      let hospLat = finalHospLat;
      let hospLng = finalHospLng;
      
      if (finalHospId) {
        const { data: hospData, error: hospError } = await supabase
          .from('hospitals')
          .select('*')
          .eq('id', finalHospId)
          .single();
          
        if (!hospError && hospData) {
          if (hospData.latitude && hospData.longitude) {
            hospLat = hospData.latitude;
            hospLng = hospData.longitude;
          }
        }
      }
      
      if (isMounted) {
        setHospitalPos({ lat: hospLat, lng: hospLng });
      }

      // 3. Set initial ambulance position
      // For this demo, we'll start it offset from the incident so it has a journey
      const startLat = hospLat ? hospLat + 0.01 : finalIncLat - 0.02;
      const startLng = hospLng ? hospLng + 0.01 : finalIncLng - 0.02;
      
      if (isMounted) {
        setAmbulancePos({ lat: startLat, lng: startLng });
        setLoading(false);
      }

      // 4. Start Simulation
      // Move ambulance towards the incident coordinates
      simInterval = setInterval(() => {
        if (!isMounted) return;
        
        setAmbulancePos(prev => {
          if (!prev) return prev;
          
          const targetLat = finalIncLat;
          const targetLng = finalIncLng;
          
          // Calculate tiny step
          const step = 0.0005;
          
          const latDiff = targetLat - prev.lat;
          const lngDiff = targetLng - prev.lng;
          
          // If very close, stop moving
          if (Math.abs(latDiff) < 0.001 && Math.abs(lngDiff) < 0.001) {
            return prev;
          }
          
          return {
            lat: prev.lat + (latDiff > 0 ? step : -step),
            lng: prev.lng + (lngDiff > 0 ? step : -step)
          };
        });
      }, 2000);
    };

    fetchTrackingData();

    return () => {
      isMounted = false;
      if (simInterval) clearInterval(simInterval);
    };
  }, [ambulanceId, incidentId]);

  // Auto scroll into view
  useEffect(() => {
    if (!loading && ambulancePos) {
      const el = document.getElementById('ambulance-tracking-panel');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [loading, ambulancePos]);

  if (loading) {
    return (
      <div className="w-full h-[400px] bg-slate-50 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 font-bold border border-border-light shadow-sm">
        Connecting to Telemetry...
      </div>
    );
  }

  if (!ambulancePos) return null;

  return (
    <div id="ambulance-tracking-panel" className="mt-8 bg-white p-6 rounded-2xl border border-border-light shadow-sm flex flex-col relative z-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h3 className="text-xl font-normal tracking-[-0.02em] text-text-primary flex items-center gap-2" style={{ fontFamily: 'var(--font-serif-display), serif' }}>
            <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse"></span>
            LIVE AMBULANCE TRACKING
          </h3>
          <p className="text-sm text-text-secondary mt-1 font-normal">Tracking AMB-{String(ambulanceId).substring(0,4).toUpperCase()}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-sm font-bold">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase">Status</span>
            <span className="text-cura-teal">● {incidentStatus.toUpperCase()}</span>
          </div>
          <div className="flex flex-col border-l border-border-light pl-4">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase">Incident</span>
            <span className="text-text-primary font-mono">#{incidentId.split('-')[0].toUpperCase()}</span>
          </div>
          <div className="flex flex-col border-l border-border-light pl-4">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase">ETA</span>
            <span className="text-danger">~ 8 min</span>
          </div>
          
          <button 
            onClick={onClose}
            className="ml-2 bg-white hover:bg-[#FFF3F5] text-[#C34F63] hover:text-[#B83F54] border border-[#E5B8C0] hover:border-[#C85A68] hover:-translate-y-[1px] shadow-sm px-[20px] h-[44px] rounded-xl font-semibold text-[14px] transition-all duration-200"
          >
            Stop Tracking
          </button>
        </div>
      </div>

      <DynamicMap 
        ambulanceLat={ambulancePos.lat}
        ambulanceLng={ambulancePos.lng}
        incidentLat={incidentPos?.lat || null}
        incidentLng={incidentPos?.lng || null}
        hospitalLat={hospitalPos?.lat || null}
        hospitalLng={hospitalPos?.lng || null}
        ambulanceId={ambulanceId}
        incidentId={incidentId}
      />
    </div>
  );
}
