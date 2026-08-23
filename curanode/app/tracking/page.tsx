"use client";

import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import { Hospital } from "../page";
import { API_BASE_URL, getWsUrl } from "@/lib/config";
import Logo from "@/components/Logo";
import { getOSRMRoute } from "@/lib/routing";

const MapComponent = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#F8FBFA] text-[#6B7780]">
      <svg className="animate-spin h-6 w-6 text-[#19B5B1] mb-2" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span className="font-semibold text-[10px] tracking-wider uppercase text-[#6B7780] animate-pulse">Loading Telemetry Map...</span>
    </div>
  )
});

interface TrackingLog {
  timestamp: string;
  message: string;
}

// Distance helper function
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Custom Vector Medical / Ambulance Illustration Component for Bottom Arrival Panel
function MedicalAmbulanceIllustration() {
  return (
    <svg viewBox="0 0 420 220" fill="none" className="w-full h-auto max-h-[175px] object-contain drop-shadow-xs">
      {/* Background Soft Radial Circle */}
      <ellipse cx="210" cy="110" rx="190" ry="90" fill="#E8F8F5" opacity="0.7" />

      {/* Background Hospital Sanctuary Outlines */}
      <g stroke="#19B5B1" strokeWidth="1.8" strokeOpacity="0.35" fill="#FFFFFF" fillOpacity="0.7">
        <path d="M40 170V85H90V170M100 170V55H160V170M170 170V105H215V170" />
      </g>
      {/* Windows with soft teal tint */}
      <rect x="112" y="75" width="14" height="14" rx="3" fill="#19B5B1" fillOpacity="0.2" />
      <rect x="134" y="75" width="14" height="14" rx="3" fill="#19B5B1" fillOpacity="0.2" />
      <rect x="112" y="98" width="14" height="14" rx="3" fill="#19B5B1" fillOpacity="0.2" />
      <rect x="134" y="98" width="14" height="14" rx="3" fill="#19B5B1" fillOpacity="0.2" />
      
      {/* Medical Cross Badge on Building */}
      <circle cx="130" cy="38" r="11" fill="#22B573" fillOpacity="0.2" />
      <path d="M130 32V44M124 38H136" stroke="#22B573" strokeWidth="2.5" strokeLinecap="round" />

      {/* Soft Ground Line with Gradient */}
      <rect x="15" y="168" width="390" height="6" rx="3" fill="#D5EDE8" />
      
      {/* ECG Heartbeat Line running along ground background */}
      <path d="M20 160 H140 L146 150 L152 170 L158 142 L164 165 L170 160 H390" stroke="#19B5B1" strokeWidth="2" strokeOpacity="0.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Ambulance Vehicle Vector */}
      <g transform="translate(150, 92)">
        {/* Shadow */}
        <ellipse cx="80" cy="74" rx="82" ry="7" fill="#19B5B1" opacity="0.18" />
        
        {/* Main Body */}
        <rect x="0" y="10" width="160" height="60" rx="10" fill="#FFFFFF" stroke="#112F35" strokeWidth="2.5" />
        <path d="M118 10L148 30H160V70H0V10H118Z" fill="#FFFFFF" />
        
        {/* Front Windshield */}
        <path d="M124 16L142 30H154V16H124Z" fill="#BDE9E4" fillOpacity="0.6" stroke="#19B5B1" strokeWidth="1.5" />
        
        {/* Mint Side Stripe */}
        <rect x="0" y="38" width="160" height="9" fill="#19B5B1" />
        
        {/* Red Heart Cross Symbol on Side */}
        <circle cx="56" cy="25" r="12" fill="#FFE5EC" stroke="#FF85A1" strokeWidth="1.5" />
        <path d="M56 18V32M49 25H63" stroke="#FF4D6D" strokeWidth="3" strokeLinecap="round" />
        
        {/* Wheels */}
        <circle cx="36" cy="70" r="12" fill="#112F35" />
        <circle cx="36" cy="70" r="5" fill="#FFFFFF" />
        <circle cx="128" cy="70" r="12" fill="#112F35" />
        <circle cx="128" cy="70" r="5" fill="#FFFFFF" />
        
        {/* Emergency Beacon Light */}
        <rect x="48" y="3" width="18" height="7" rx="3.5" fill="#22B573" />
        <circle cx="57" cy="6" r="8" fill="#22B573" opacity="0.3" />
      </g>

      {/* Responders / Paramedics Figures */}
      <g transform="translate(45, 102)">
        {/* Paramedic 1 (Lead Paramedic with Medical Bag) */}
        <circle cx="20" cy="14" r="8" fill="#112F35" />
        <rect x="11" y="24" width="18" height="36" rx="5" fill="#19B5B1" />
        <path d="M11 60V74M29 60V74" stroke="#112F35" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="22" y="34" width="8" height="10" rx="2" fill="#FFFFFF" stroke="#112F35" strokeWidth="1.5" />
        
        {/* Paramedic 2 (Supporting Specialist) */}
        <circle cx="55" cy="16" r="8" fill="#112F35" />
        <rect x="46" y="26" width="18" height="34" rx="5" fill="#22B573" />
        <path d="M46 60V74M64 60V74" stroke="#112F35" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* Subtle Floating Decorative Symbols around vector */}
      <text x="350" y="60" fill="#FF85A1" fontSize="14" fontFamily="sans-serif">♡</text>
      <text x="25" y="80" fill="#19B5B1" fontSize="14" fontFamily="sans-serif">✦</text>
      <text x="370" y="130" fill="#22B573" fontSize="12" fontFamily="sans-serif">✚</text>
    </svg>
  );
}

// POLISHED DEDICATED ARRIVAL SUCCESS UI FOR WHEN AMBULANCE HAS ARRIVED (journeyStep === 4)
function ArrivalSuccessUI({
  hospital,
  logs,
  onNotifyFamily,
}: {
  hospital: Hospital | null;
  logs: TrackingLog[];
  onNotifyFamily: () => void;
}) {
  return (
    <main className="w-full max-w-[1140px] mx-auto px-4 sm:px-6 py-6 flex-1 min-h-0 flex flex-col justify-between overflow-y-auto box-border bg-[#F8FFFD] animate-in fade-in duration-300 space-y-5">
      
      {/* 1. MAIN HERO CARD */}
      <section className="relative rounded-[24px] border border-[#D5EDE8] bg-gradient-to-r from-[#F0FAF8] via-[#F4FAF9] to-[#EBF7F5] p-6 sm:p-8 md:p-10 shadow-sm shrink-0 overflow-hidden">
        
        {/* Soft Background Radial Glow */}
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#19B5B1]/06 rounded-full blur-3xl pointer-events-none -z-0" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center text-left">
          
          {/* LEFT SIDE: Heading & Status (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Circular Checkmark Badge & Pill */}
            <div className="flex items-center space-x-3">
              <div className="relative w-12 h-12 rounded-full bg-[#087F7B] text-white flex items-center justify-center text-xl font-bold shadow-[0_4px_14px_rgba(8,127,123,0.25)] ring-4 ring-[#EAF8F5]">
                ✓
              </div>
              
              <span className="bg-[#EAF8F5] text-[#087F7B] border border-[#BDE9E4] px-3.5 py-1 rounded-full font-ui font-semibold text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5 shadow-2xs">
                <span>AMBULANCE REACHED</span>
              </span>
            </div>

            {/* Large Heading */}
            <div className="space-y-2 pt-1">
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[40px] font-semibold text-[#112F35] tracking-tight leading-[1.15]">
                Our medical team <br className="hidden sm:inline" />
                <span className="text-[#087F7B] font-bold">is with you now.</span>
              </h1>
              
              {/* ECG Pulse Heartbeat Line */}
              <div className="py-1">
                <svg className="w-32 h-5 text-[#19B5B1] opacity-70" viewBox="0 0 120 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M0 10 H40 L46 2 L52 18 L58 5 L64 13 L70 10 H120" />
                </svg>
              </div>

              {/* Supporting Line */}
              <p className="font-body text-sm sm:text-base text-[#475569] font-normal flex items-center space-x-1.5">
                <span>You are in safe hands.</span>
                <span className="text-[#087F7B] text-base">💚</span>
              </p>
            </div>

          </div>

          {/* RIGHT SIDE: Ambulance Vehicle Image (NO Humans) (5 Cols) */}
          <div className="lg:col-span-5 flex justify-center items-center">
            <div className="w-full max-w-[480px] relative flex items-center justify-center">
              <img 
                src="/images/curanode_ambulance.png" 
                alt="CuraNode Emergency Ambulance" 
                className="w-full h-auto object-contain rounded-2xl filter drop-shadow-md transition-transform duration-300 hover:scale-[1.01]"
              />
            </div>
          </div>

        </div>
      </section>

      {/* 2. EMERGENCY STATUS SECTION */}
      <section className="bg-white rounded-[20px] border border-[#E2E8F0] p-5 sm:p-6 shadow-2xs shrink-0 text-left">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          {/* Left Message & Shield Icon (8 Cols) */}
          <div className="md:col-span-8 flex items-start space-x-4">
            <div className="w-11 h-11 rounded-full bg-[#EAF8F5] border border-[#BDE9E4] text-[#087F7B] flex items-center justify-center text-xl shrink-0 shadow-2xs mt-0.5">
              🛡
            </div>
            
            <div className="space-y-1">
              <div className="font-ui text-[10.5px] font-semibold text-[#087F7B] uppercase tracking-wide">
                EMERGENCY STATUS
              </div>
              
              <h3 className="font-ui text-sm sm:text-base font-semibold text-[#112F35] flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#087F7B] shrink-0"></span>
                <span>Medical team reached your location.</span>
              </h3>
              
              <p className="font-body text-xs text-[#64748B] font-normal">
                Our medical personnel are on-site and providing the required assistance.
              </p>
            </div>
          </div>

          {/* Divider on Desktop */}
          <div className="hidden md:block md:col-span-1 flex justify-center">
            <div className="h-12 w-[1px] bg-[#E2E8F0]"></div>
          </div>

          {/* Right Active Shield Badge (3 Cols) */}
          <div className="md:col-span-3 flex flex-col items-center justify-center space-y-1 py-1 md:py-0 border-t md:border-t-0 border-[#E2E8F0] pt-3 md:pt-0">
            <div className="w-10 h-10 rounded-full bg-[#EAF8F0] border border-[#A7F3D0] text-[#059669] flex items-center justify-center text-lg shadow-2xs">
              ✓
            </div>
            <span className="font-ui text-xs font-semibold text-[#087F7B] uppercase tracking-wider">
              ACTIVE
            </span>
          </div>

        </div>
      </section>

      {/* 3. FINAL REASSURANCE BANNER */}
      <section className="bg-gradient-to-r from-[#EBF7F5] via-[#F4FAF8] to-[#EAF8F6] rounded-[20px] border border-[#D5EDE8] p-4 sm:p-5 shadow-2xs shrink-0 flex items-center justify-between text-left">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-full bg-white border border-[#BDE9E4] text-[#087F7B] flex items-center justify-center text-lg shrink-0 shadow-2xs">
            💚
          </div>
          
          <div className="space-y-0.5">
            <h4 className="font-display text-sm sm:text-base font-semibold text-[#112F35]">
              We're here for you.
            </h4>
            <p className="font-body text-xs text-[#64748B] font-normal">
              Your safety is our priority. Focus on getting the care you need.
            </p>
          </div>
        </div>

        {/* Soft Decorative Watermark Cross Icon on Right */}
        <div className="hidden sm:flex items-center justify-center opacity-20 text-[#087F7B] text-3xl select-none pr-2">
          ✚
        </div>
      </section>

      {/* 4. FOOTER */}
      <footer className="w-full pt-2 pb-4 text-center shrink-0">
        <div className="font-body text-xs text-[#64748B] font-normal flex items-center justify-center space-x-1.5">
          <span>🛡</span>
          <span>CuraNode Emergency Telemetry Network &copy; {new Date().getFullYear()} — All Rights Reserved.</span>
        </div>
      </footer>

    </main>
  );
}

export function TrackingContent({
  incidentId: propIncidentId,
  hospitalId: propHospitalId,
}: {
  incidentId?: string | null;
  hospitalId?: string | null;
} = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const incidentId = propIncidentId || searchParams.get("incidentId");
  const hospitalId = propHospitalId || searchParams.get("hospitalId");

  const [incident, setIncident] = useState<any>(null);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentState, setCurrentState] = useState<number>(4); // Default 4: Waiting / Pending response
  const [dispatchedAmbulance, setDispatchedAmbulance] = useState<any>(null);
  const [dispatchStatus, setDispatchStatus] = useState<string>("idle");
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  // Simulation & Telemetry States
  const [simulatedAmbulancePos, setSimulatedAmbulancePos] = useState<[number, number] | null>(null);
  const [simulatedEta, setSimulatedEta] = useState<string>("5 mins");
  const [simulatedDistance, setSimulatedDistance] = useState<string>("2.1 km");
  const [journeyStep, setJourneyStep] = useState<number>(1);
  const [isAmbulanceArrived, setIsAmbulanceArrived] = useState<boolean>(false);

  // REAL Escalation Deadline & Decrementing Countdown Timer States
  const [escalationDeadlineMs, setEscalationDeadlineMs] = useState<number | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  
  const [logs, setLogs] = useState<TrackingLog[]>([
    { timestamp: new Date().toLocaleTimeString(), message: "Emergency session initiated. Live backend telemetry connected." }
  ]);

  const currentStatusRef = useRef(4);

  const playSound = useCallback((type: "success" | "warning" | "completion") => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      if (type === "success") {
        const freqs = [329.63, 392.00, 523.25];
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now + i * 0.08);
          gain.gain.setValueAtTime(0.08, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.25);
        });
      } else if (type === "warning") {
        [0, 0.15].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(140, now + delay);
          gain.gain.setValueAtTime(0.06, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.15);
        });
      }
    } catch (e) {
      console.warn("Audio feedback offline", e);
    }
  }, []);

  // EVENT DEDUPLICATION BY MESSAGE STRING
  const addLog = useCallback((message: string) => {
    setLogs((prev) => {
      if (prev.some((l) => l.message === message)) {
        return prev;
      }
      const timestamp = new Date().toLocaleTimeString();
      return [{ timestamp, message }, ...prev];
    });
  }, []);

  const updateState = useCallback((targetState: number) => {
    currentStatusRef.current = targetState;
    setCurrentState(targetState);
    if (targetState === 5 || targetState === 8) playSound("success");
  }, [playSound]);

  const syncBackendStatus = useCallback(async () => {
    if (!incidentId) return;
    try {
      const apiRes = await fetch(`${API_BASE_URL}/api/incident/${incidentId}/status`);
      if (apiRes.ok) {
        const statusSummary = await apiRes.json();
        if (statusSummary.incident) setIncident(statusSummary.incident);
        if (statusSummary.hospital) setHospital(statusSummary.hospital);

        if (statusSummary.ambulance) {
          setDispatchedAmbulance(statusSummary.ambulance);
          setDispatchStatus((statusSummary.ambulance.status || "").toUpperCase());
        } else if (statusSummary.hospital && (statusSummary.incident?.status === "DISPATCHED" || statusSummary.incident?.incident_status === "HOSPITAL_ACCEPTED" || statusSummary.incident?.status === "HOSPITAL_ACCEPTED")) {
          setDispatchedAmbulance({
            id: "1",
            number: "AMB-204",
            status: "DISPATCHED",
            latitude: typeof statusSummary.hospital.latitude === "string" ? parseFloat(statusSummary.hospital.latitude) : statusSummary.hospital.latitude,
            longitude: typeof statusSummary.hospital.longitude === "string" ? parseFloat(statusSummary.hospital.longitude) : statusSummary.hospital.longitude,
            eta: statusSummary.hospital.estimated_travel_time ? `${statusSummary.hospital.estimated_travel_time} mins` : "5 mins"
          });
          setDispatchStatus("DISPATCHED");
        }

        const incStatus = (statusSummary.incident?.status || "").toUpperCase();
        const incStatus2 = (statusSummary.incident?.incident_status || "").toUpperCase();
        const logStatus = (statusSummary.active_dispatch_log?.dispatch_status || statusSummary.active_dispatch_log?.status || "").toUpperCase();

        const isAcceptedState =
          incStatus === "DISPATCHED" ||
          incStatus === "HOSPITAL_ACCEPTED" ||
          incStatus === "ACCEPTED" ||
          incStatus2 === "HOSPITAL_ACCEPTED" ||
          incStatus2 === "DISPATCHED" ||
          incStatus2 === "ACCEPTED" ||
          logStatus === "ACCEPTED" ||
          logStatus === "DISPATCHED" ||
          logStatus === "HOSPITAL_ACCEPTED";

        if (isAcceptedState) {
          updateState(5); // Hospital Request Accepted
          setEscalationDeadlineMs(null);
          setCountdownSeconds(null);
        } else {
          updateState(4);
          const requestedAtStr = statusSummary.requested_at || statusSummary.active_dispatch_log?.requested_at || statusSummary.active_dispatch_log?.created_at || statusSummary.incident?.created_at;
          const timeoutSec = statusSummary.timeout_seconds || 300;

          if (requestedAtStr) {
            const reqTime = new Date(requestedAtStr.replace("Z", "+00:00")).getTime();
            if (!isNaN(reqTime)) {
              setEscalationDeadlineMs(reqTime + timeoutSec * 1000);
            }
          } else if (statusSummary.remaining_seconds !== undefined) {
            setEscalationDeadlineMs(Date.now() + statusSummary.remaining_seconds * 1000);
          }
        }
      }
    } catch (err) {
      console.warn("[TELEMETRY] Backend sync check failed:", err);
    }
  }, [incidentId, updateState]);

  // REAL 1-SECOND COUNTDOWN TIMER EFFECT
  useEffect(() => {
    if (currentState >= 5 || escalationDeadlineMs === null) {
      setCountdownSeconds(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remainingMs = escalationDeadlineMs - now;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setCountdownSeconds(remainingSec);

      if (remainingSec <= 0) {
        syncBackendStatus();
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [currentState, escalationDeadlineMs, syncBackendStatus]);

  // Initial Fetch
  useEffect(() => {
    if (!incidentId || !hospitalId) {
      router.push("/");
      return;
    }

    const initFetch = async () => {
      try {
        setLoading(true);
        await syncBackendStatus();

        const { data: incData } = await supabase.from("incidents").select("*").eq("id", incidentId).single();
        if (incData) {
          setIncident(incData);
          const s = (incData.status || incData.incident_status || "").toUpperCase();
          if (s === "DISPATCHED" || s === "HOSPITAL_ACCEPTED" || s === "ACCEPTED") {
            currentStatusRef.current = 5;
            setCurrentState(5);
            setEscalationDeadlineMs(null);
            setCountdownSeconds(null);
          }
        }

        const { data: hospData } = await supabase.from("hospitals").select("*").eq("id", hospitalId).single();
        if (hospData) setHospital(hospData as Hospital);

      } catch (err) {
        console.error("Tracking sync error:", err);
      } finally {
        setLoading(false);
      }
    };

    initFetch();
  }, [incidentId, hospitalId, router, syncBackendStatus]);

  // Supabase Realtime Subscription with Comprehensive Acceptance Status Detection
  useEffect(() => {
    if (!incidentId) return;

    const channel = supabase
      .channel(`curanode-incident-${incidentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents", filter: `id=eq.${incidentId}` },
        (payload: any) => {
          const newStatus = (payload.new?.status || payload.new?.incident_status || "").toUpperCase();
          if (newStatus === "DISPATCHED" || newStatus === "HOSPITAL_ACCEPTED" || newStatus === "ACCEPTED") {
            currentStatusRef.current = 5;
            setCurrentState(5);
            setEscalationDeadlineMs(null);
            setCountdownSeconds(null);
            addLog("Hospital accepted request! Emergency dispatch active.");
          }
          syncBackendStatus();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatch_logs", filter: `incident_id=eq.${incidentId}` },
        (payload: any) => {
          const newStatus = (payload.new?.dispatch_status || payload.new?.status || "").toUpperCase();
          if (newStatus === "DISPATCHED" || newStatus === "ACCEPTED" || newStatus === "HOSPITAL_ACCEPTED") {
            currentStatusRef.current = 5;
            setCurrentState(5);
            setEscalationDeadlineMs(null);
            setCountdownSeconds(null);
            addLog("Ambulance dispatched from hospital base.");
          }
          syncBackendStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [incidentId, syncBackendStatus, addLog]);

  // Load Real OSRM Road Polyline with Fallback Interpolation
  useEffect(() => {
    if (currentState < 5 || !hospital || !incident) return;

    const loadRoadRoute = async () => {
      try {
        const startLat = typeof hospital.latitude === "string" ? parseFloat(hospital.latitude) : hospital.latitude;
        const startLon = typeof hospital.longitude === "string" ? parseFloat(hospital.longitude) : hospital.longitude;
        const endLat = typeof incident.latitude === "string" ? parseFloat(incident.latitude) : incident.latitude;
        const endLon = typeof incident.longitude === "string" ? parseFloat(incident.longitude) : incident.longitude;

        if (isNaN(startLat) || isNaN(startLon) || isNaN(endLat) || isNaN(endLon)) return;

        const route = await getOSRMRoute(startLat, startLon, endLat, endLon);
        if (route.coordinates && route.coordinates.length > 0) {
          setRouteCoords(route.coordinates);
          setSimulatedDistance(route.distance);
          setSimulatedEta(route.duration);
        } else {
          // Generate 25-point interpolated fallback route if OSRM is offline
          const fallbackPoints: [number, number][] = [];
          const steps = 25;
          for (let i = 0; i <= steps; i++) {
            const lat = startLat + (endLat - startLat) * (i / steps);
            const lon = startLon + (endLon - startLon) * (i / steps);
            fallbackPoints.push([lat, lon]);
          }
          setRouteCoords(fallbackPoints);
          const totalDist = getDistanceKm(startLat, startLon, endLat, endLon);
          setSimulatedDistance(`${totalDist.toFixed(1)} km`);
          setSimulatedEta(`${Math.max(1, Math.ceil((totalDist / 45) * 60))} mins`);
        }
      } catch (e) {
        console.warn("Road route fetch error, using fallback polyline:", e);
        const startLat = typeof hospital.latitude === "string" ? parseFloat(hospital.latitude) : hospital.latitude;
        const startLon = typeof hospital.longitude === "string" ? parseFloat(hospital.longitude) : hospital.longitude;
        const endLat = typeof incident.latitude === "string" ? parseFloat(incident.latitude) : incident.latitude;
        const endLon = typeof incident.longitude === "string" ? parseFloat(incident.longitude) : incident.longitude;
        if (!isNaN(startLat) && !isNaN(startLon) && !isNaN(endLat) && !isNaN(endLon)) {
          const fallbackPoints: [number, number][] = [];
          const steps = 25;
          for (let i = 0; i <= steps; i++) {
            const lat = startLat + (endLat - startLat) * (i / steps);
            const lon = startLon + (endLon - startLon) * (i / steps);
            fallbackPoints.push([lat, lon]);
          }
          setRouteCoords(fallbackPoints);
        }
      }
    };

    loadRoadRoute();
  }, [currentState, hospital, incident]);

  // Ambulance Movement Simulation along Real OSRM Road Polyline (Smooth 1000ms Step)
  useEffect(() => {
    if (currentState < 5 || !routeCoords || routeCoords.length < 2) return;

    let currentIdx = 0;
    setSimulatedAmbulancePos(routeCoords[0]);
    setJourneyStep(2); // En Route
    addLog(`Unit AMB-204 dispatched from ${hospital?.name || "Hospital Base"}.`);

    const totalPoints = routeCoords.length;
    const interval = setInterval(() => {
      currentIdx += 1;

      if (currentIdx >= totalPoints - 1) {
        currentIdx = totalPoints - 1;
        setSimulatedAmbulancePos(routeCoords[currentIdx]);
        setIsAmbulanceArrived(true);
        setJourneyStep(4); // Patient Reached
        setDispatchStatus("ARRIVED");
        setSimulatedEta("0 mins");
        setSimulatedDistance("0.0 km");
        addLog("Ambulance has arrived at patient location.");
        playSound("success");
        clearInterval(interval);
        return;
      }

      const currentPos = routeCoords[currentIdx];
      setSimulatedAmbulancePos(currentPos);

      // Compute remaining polyline distance dynamically
      let remDist = 0;
      for (let i = currentIdx; i < totalPoints - 1; i++) {
        const p1 = routeCoords[i];
        const p2 = routeCoords[i + 1];
        remDist += getDistanceKm(p1[0], p1[1], p2[0], p2[1]);
      }

      const formattedDist = `${remDist.toFixed(1)} km`;
      const estimatedMinutes = Math.max(1, Math.ceil((remDist / 45) * 60));
      const formattedEta = `${estimatedMinutes} min${estimatedMinutes > 1 ? "s" : ""}`;

      setSimulatedDistance(formattedDist);
      setSimulatedEta(formattedEta);

      if (currentIdx > totalPoints * 0.75) {
        setJourneyStep(3); // Arrived at location
      } else {
        setJourneyStep(2); // En Route
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentState, routeCoords, hospital, addLog, playSound]);

  const handleCancelRequest = async () => {
    if (!incidentId) return;

    try {
      playSound("warning");
      await supabase.from("incidents").update({ status: "COMPLETED" }).eq("id", incidentId);
      await fetch(`${API_BASE_URL}/api/cancel-emergency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId })
      });
      addLog("Emergency request cancelled.");
      router.push("/");
    } catch (err) {
      console.error("Failed to cancel request:", err);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-[100dvh] bg-[#F8FBFA] flex flex-col items-center justify-center p-6 text-[#6B7780] overflow-hidden">
        <svg className="animate-spin h-8 w-8 text-[#19B5B1] mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="font-bold text-xs text-[#16232D]">Connecting Live Emergency Telemetry...</p>
      </div>
    );
  }

  const isAccepted = currentState >= 5;
  const canonicalIncidentId = incident?.id || incidentId || propIncidentId || "";

  return (
    <div className="w-full min-h-screen lg:h-[100dvh] lg:max-h-[100dvh] bg-[#F8FBFA] text-[#16232D] font-sans flex flex-col overflow-x-hidden lg:overflow-hidden relative select-none">
      
      {/* 1. POLISHED PROMINENT 64PX HEADER */}
      <header className="w-full h-[64px] min-h-[64px] max-h-[64px] bg-white border-b border-[#E3EEEC] px-4 sm:px-6 flex items-center justify-between z-30 shadow-2xs shrink-0">
        {/* Left Logo & Brand */}
        <div className="flex items-center space-x-3.5">
          <Logo size="md" />

          <div className="h-7 w-[1px] bg-[#E3EEEC] mx-0.5 hidden sm:block"></div>

          <div className="hidden sm:flex flex-col text-left leading-tight">
            <div className="flex items-center space-x-2">
              <span className="text-[15px] font-extrabold text-[#16232D] tracking-tight">CuraNode</span>
              <span className="text-[9px] bg-[#EAF8F0] text-[#087F7B] font-extrabold px-2 py-0.5 rounded-full border border-[#BDE9E4] uppercase tracking-wider">
                LIVE
              </span>
            </div>
            <span className="text-[9px] text-[#7A8790] font-semibold tracking-widest uppercase">INTELLIGENT EMERGENCY CARE</span>
          </div>
        </div>

        {/* Center Live Emergency Tracking Title */}
        <div className="hidden md:flex flex-col items-center leading-tight">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22B573] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22B573]"></span>
            </span>
            <span className="text-sm font-extrabold text-[#16232D] tracking-tight">Live Emergency Tracking</span>
          </div>
          <span className="text-[10px] text-[#7A8790] font-medium mt-0.5">We're with you, every step of the way</span>
        </div>

        {/* Right Active Emergency Badge */}
        <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
          </span>
          <span className="font-ui text-[10px] sm:text-[11px] font-semibold text-rose-700 uppercase tracking-wide shrink-0">
            EMERGENCY ACTIVE
          </span>
        </div>
      </header>

      {/* 2. CONDITIONAL STATE ROUTER: PENDING vs ARRIVED vs EN-ROUTE */}
      {!isAccepted ? (
        /* CLEAN & MINIMAL AWAITING HOSPITAL ACCEPTANCE STATE */
        <main className="w-full min-h-[calc(100vh-64px)] lg:h-[calc(100vh-64px)] flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto bg-[#F8FFFD] animate-in fade-in duration-300">
          
          <div className="bg-white rounded-2xl p-5 sm:p-7 border border-[#E2E8F0] shadow-sm max-w-[540px] w-full space-y-4 text-center relative overflow-hidden shrink-0">
            
            {/* 1. STATUS HEADER */}
            <div className="space-y-2">
              <div className="flex flex-col items-center">
                <span className="bg-[#FFF8EB] text-[#D97706] border border-[#FDE68A] px-3.5 py-1 rounded-full font-semibold text-[10.5px] uppercase tracking-wider inline-flex items-center gap-1.5 shadow-2xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F59E0B] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D97706]"></span>
                  </span>
                  <span>AWAITING ACCEPTANCE</span>
                </span>
              </div>

              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-semibold text-[#112F35] tracking-tight">
                  Awaiting Hospital Acceptance
                </h1>
                <p className="text-xs text-[#64748B] font-normal">
                  Your emergency request is being reviewed.
                </p>
                {canonicalIncidentId && (
                  <div className="text-[10px] font-mono text-[#087F7B] font-normal tracking-wide pt-0.5">
                    EMERGENCY SESSION ID: {canonicalIncidentId}
                  </div>
                )}
              </div>
            </div>

            {/* 2. HOSPITAL REQUEST CARD */}
            <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-[#E2E8F0] shadow-2xs text-left space-y-2">
              <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2">
                <span className="text-[10.5px] font-medium text-[#64748B] uppercase tracking-wider">
                  REQUEST SENT TO
                </span>
                <span className="text-[10px] font-medium text-[#059669] bg-[#ECFDF5] px-2 py-0.5 rounded-md border border-[#A7F3D0]">
                  ✓ Request Transmitted
                </span>
              </div>

              <div className="space-y-1">
                <div className="text-base sm:text-lg font-semibold text-[#112F35]">
                  {hospital?.name || "BGS Global Hospital"}
                </div>
                <div className="text-xs text-[#087F7B] font-normal flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#22B573] animate-pulse shrink-0"></span>
                  <span>Emergency desk notified</span>
                </div>
              </div>
            </div>

            {/* 3. REQUEST PROGRESS */}
            <div className="bg-white rounded-xl p-3.5 border border-[#E2E8F0] shadow-2xs">
              <div className="relative w-full flex items-center justify-between text-center">
                {/* Thin Connecting Line */}
                <div className="absolute top-[10px] left-[15%] right-[15%] h-[1.5px] bg-[#E2E8F0] -z-0">
                  <div className="h-full bg-[#19B5B1] w-1/2"></div>
                </div>

                {/* Step 1: Request Sent (Completed) */}
                <div className="relative z-10 flex flex-col items-center w-1/3">
                  <div className="w-5 h-5 rounded-full bg-[#19B5B1] text-white font-bold text-[10px] flex items-center justify-center border-2 border-white shadow-2xs">
                    ✓
                  </div>
                  <span className="text-[10px] font-medium text-[#087F7B] mt-1.5">Request Sent</span>
                </div>

                {/* Step 2: Hospital Review (Active/Waiting) */}
                <div className="relative z-10 flex flex-col items-center w-1/3">
                  <div className="w-5 h-5 rounded-full bg-[#FFF8EB] border-2 border-[#D97706] text-[#D97706] font-bold text-[9px] flex items-center justify-center shadow-2xs animate-pulse ring-2 ring-[#F59E0B]/20">
                    ●
                  </div>
                  <span className="text-[10px] font-semibold text-[#D97706] mt-1.5">Hospital Review</span>
                </div>

                {/* Step 3: Accepted (Pending) */}
                <div className="relative z-10 flex flex-col items-center w-1/3">
                  <div className="w-5 h-5 rounded-full bg-white border-2 border-[#CBD5E1] text-[#94A3B8] font-normal text-[9px] flex items-center justify-center">
                    ○
                  </div>
                  <span className="text-[10px] font-normal text-[#94A3B8] mt-1.5">Accepted</span>
                </div>
              </div>
            </div>

            {/* 4. AUTOMATED ESCALATION CARD */}
            <div className="bg-[#F4FAF9] rounded-xl p-4 border border-[#BDE9E4] text-center space-y-1 shadow-2xs">
              <div className="text-[10px] font-semibold text-[#087F7B] uppercase tracking-wider">
                AUTOMATED ESCALATION
              </div>
              
              <div className="text-4xl sm:text-[42px] font-bold text-[#087F7B] font-mono tracking-tight my-1 leading-none">
                {countdownSeconds !== null ? (
                  `${Math.floor(countdownSeconds / 60).toString().padStart(2, '0')}:${(countdownSeconds % 60).toString().padStart(2, '0')}`
                ) : (
                  "05:00"
                )}
              </div>

              <div className="text-xs font-medium text-[#112F35]">
                Hospital acceptance pending
              </div>

              <p className="text-[11px] text-[#64748B] font-normal max-w-xs mx-auto">
                Auto-escalates if not accepted
              </p>
            </div>

            {/* 5. REASSURANCE */}
            <div className="pt-0.5">
              <div className="text-xs font-medium text-[#087F7B] inline-flex items-center justify-center space-x-1.5 bg-[#EAF8F5] px-3.5 py-1.5 rounded-full border border-[#BDE9E4]/60">
                <span>💚</span>
                <span>CuraNode is monitoring your emergency</span>
              </div>
            </div>

            {/* 6. CANCEL BUTTON */}
            <div className="pt-1">
              <button
                onClick={handleCancelRequest}
                className="w-full h-[42px] bg-white hover:bg-rose-50/80 border border-rose-200 hover:border-rose-300 text-rose-600 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer active:scale-[0.99]"
              >
                <span>✕</span>
                <span>Cancel Emergency Request</span>
              </button>
            </div>

          </div>
        </main>
      ) : isAmbulanceArrived ? (
        /* POLISHED DEDICATED ARRIVAL SUCCESS UI FOR WHEN AMBULANCE HAS ARRIVED (journeyStep === 4) */
        <ArrivalSuccessUI 
          hospital={hospital}
          logs={logs}
          onNotifyFamily={() => alert("Emergency contacts notified.")}
        />
      ) : (
        /* LOCKED EXISTING EN-ROUTE LIVE TRACKING UI (UNTOUCHED FOR journeyStep < 4) */
        <main className="w-full max-w-[1400px] mx-auto px-3 sm:px-5 pt-2.5 pb-2 flex-1 min-h-0 flex flex-col justify-between overflow-y-auto lg:overflow-hidden box-border">
          
          {/* TRACKING GRID: MAP & LEFT STACK (LEFT ~48%, RIGHT ~52%) */}
          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-3 flex-1 min-h-0 overflow-visible lg:overflow-hidden items-stretch">
            
            {/* LEFT COLUMN: TELEMETRY STACK */}
            <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden text-left">
              
              {/* CARD 1 — EMERGENCY ACCEPTED */}
              <div className="rounded-[14px] border border-[#E3EEEC] bg-white p-2.5 shadow-[0_4px_20px_rgba(20,70,65,0.05)] shrink-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[9px] font-extrabold tracking-wider text-[#087F7B] uppercase">
                    ACTIVE EMERGENCY • <span className="font-mono text-[#19B5B1]">ID: {canonicalIncidentId}</span>
                  </span>

                  <span className="rounded-full bg-[#EAF8F0] px-2 py-0.5 text-[9px] font-extrabold text-[#22B573] uppercase tracking-wider border border-[#22B573]/20">
                    ACCEPTED
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EAF8F0] text-[#22B573] font-bold text-xs shrink-0 border border-[#22B573]/30">
                    ✓
                  </div>

                  <div>
                    <h1 className="text-base font-extrabold text-[#16232D] leading-tight tracking-tight">
                      Emergency Accepted
                    </h1>

                    <p className="text-[11px] text-[#7A8790] font-medium mt-0.5">
                      Responders are on the way to you
                    </p>
                  </div>
                </div>
              </div>

              {/* CARD 2 — AMBULANCE ON THE WAY & DISTINCT METRIC BOXES */}
              <div className="rounded-[14px] border border-[#E3EEEC] bg-white p-2.5 shadow-[0_4px_20px_rgba(20,70,65,0.05)] space-y-1.5 shrink-0">
                <div className="flex items-center justify-between border-b border-[#E3EEEC] pb-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs">🚑</span>
                    <h3 className="text-[10px] font-extrabold text-[#16232D] uppercase tracking-wider">AMBULANCE ON THE WAY</h3>
                  </div>
                  <span className="rounded-full bg-[#EAF8F0] px-2 py-0.5 text-[8px] font-bold text-[#087F7B] uppercase tracking-wider border border-[#087F7B]/20">
                    EN ROUTE
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#16232D]">
                      {dispatchedAmbulance?.number || "AMB-204"}
                    </div>
                    <div className="text-[11px] text-[#6B7780] font-semibold">
                      {hospital?.name || "SSIMS Sparsh Hospital"}
                    </div>
                  </div>
                </div>

                {/* Destination & Base Details */}
                <div className="space-y-0.5 text-[9px] pt-1 border-t border-[#E3EEEC]">
                  <div className="flex items-start space-x-1.5">
                    <span className="w-3 h-3 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-[7px] shrink-0 mt-0.5">📍</span>
                    <div>
                      <div className="text-[7px] font-bold text-[#7A8790] uppercase tracking-wider">DESTINATION</div>
                      <div className="font-semibold text-[#16232D]">Patient GPS Location ({incident?.latitude ? `${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}` : "Live Location"})</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-[7px] shrink-0 mt-0.5">🏥</span>
                    <div>
                      <div className="text-[7px] font-bold text-[#7A8790] uppercase tracking-wider">BASE</div>
                      <div className="font-semibold text-[#16232D]">{hospital?.name || "SSIMS Sparsh Hospital"}, Davangere</div>
                    </div>
                  </div>
                </div>

                {/* DISTINCT THREE-COLUMN METRIC ROW */}
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  <div className="rounded-lg bg-[#F7FBFA] border border-[#E3EEEC] p-1.5 text-center shadow-2xs">
                    <div className="text-[7.5px] font-bold text-[#7A8790] uppercase tracking-[.5px]">ETA</div>
                    <div className="text-sm font-bold text-[#087F7B] mt-0.5">{simulatedEta}</div>
                  </div>
                  <div className="rounded-lg bg-[#F7FBFA] border border-[#E3EEEC] p-1.5 text-center shadow-2xs">
                    <div className="text-[7.5px] font-bold text-[#7A8790] uppercase tracking-[.5px]">DISTANCE</div>
                    <div className="text-sm font-bold text-[#16232D] mt-0.5">{simulatedDistance}</div>
                  </div>
                  <div className="rounded-lg bg-[#F7FBFA] border border-[#E3EEEC] p-1.5 text-center shadow-2xs">
                    <div className="text-[7.5px] font-bold text-[#7A8790] uppercase tracking-[.5px]">SPEED</div>
                    <div className="text-sm font-bold text-[#16232D] mt-0.5">48 km/h</div>
                  </div>
                </div>
              </div>

              {/* CARD 3 — JOURNEY PROGRESS */}
              <div 
                className="journey-progress-card shrink-0" 
                style={{ 
                  width: "100%", 
                  boxSizing: "border-box", 
                  padding: "12px 16px 10px", 
                  background: "#ffffff", 
                  border: "1px solid #e5e7eb", 
                  borderRadius: "14px", 
                  minHeight: "88px", 
                  overflow: "visible" 
                }}
              >
                <div 
                  className="journey-progress-title" 
                  style={{ 
                    marginBottom: "10px", 
                    fontSize: "11px", 
                    lineHeight: "14px", 
                    fontWeight: 700, 
                    letterSpacing: "0.08em", 
                    color: "#334155" 
                  }}
                >
                  JOURNEY PROGRESS
                </div>

                <div 
                  className="journey-progress" 
                  style={{ 
                    position: "relative", 
                    width: "100%", 
                    height: "44px", 
                    display: "flex", 
                    alignItems: "flex-start", 
                    justifyContent: "space-between", 
                    overflow: "visible" 
                  }}
                >
                  <div 
                    className="journey-line" 
                    style={{ 
                      position: "absolute", 
                      top: "10px", 
                      left: "12.5%", 
                      right: "12.5%", 
                      height: "2px", 
                      background: "#dbe5e7", 
                      zIndex: 1, 
                      overflow: "visible" 
                    }}
                  >
                    <div 
                      className="journey-line-completed" 
                      style={{ 
                        height: "100%", 
                        background: "#14b8a6", 
                        width: journeyStep === 1 ? '0%' : journeyStep === 2 ? '33.333%' : journeyStep === 3 ? '66.666%' : '100%' 
                      }} 
                    />
                  </div>

                  {/* Step 1 */}
                  <div 
                    className={`journey-step ${journeyStep >= 1 ? "completed" : ""}`} 
                    style={{ position: "relative", width: "25%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible", zIndex: 2 }}
                  >
                    <div 
                      className="journey-circle" 
                      style={{ position: "relative", zIndex: 3, width: "22px", height: "22px", minWidth: "22px", minHeight: "22px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: journeyStep >= 1 ? "#14b8a6" : "#ffffff", border: journeyStep >= 1 ? "2px solid #14b8a6" : "2px solid #cbd5e1", color: journeyStep >= 1 ? "#ffffff" : "#64748b", fontSize: "10px", fontWeight: 700, lineHeight: 1 }}
                    >
                      ✓
                    </div>
                    <div 
                      className="journey-label" 
                      style={{ display: "block", marginTop: "6px", width: "100%", textAlign: "center", color: journeyStep >= 1 ? "#0f766e" : "#64748b", fontSize: "9px", lineHeight: "11px", fontWeight: journeyStep >= 1 ? 600 : 500, whiteSpace: "nowrap" }}
                    >
                      Request Accepted
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div 
                    className={`journey-step ${journeyStep >= 2 ? (journeyStep === 2 ? "active" : "completed") : ""}`} 
                    style={{ position: "relative", width: "25%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible", zIndex: 2 }}
                  >
                    <div 
                      className="journey-circle" 
                      style={{ position: "relative", zIndex: 3, width: "22px", height: "22px", minWidth: "22px", minHeight: "22px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: journeyStep >= 2 ? "#14b8a6" : "#ffffff", border: journeyStep >= 2 ? "2px solid #14b8a6" : "2px solid #cbd5e1", color: journeyStep >= 2 ? "#ffffff" : "#64748b", fontSize: "10px", fontWeight: 700, lineHeight: 1, boxShadow: journeyStep === 2 ? "0 0 0 4px rgba(20, 184, 166, 0.12)" : "none" }}
                    >
                      {journeyStep >= 2 ? "●" : "2"}
                    </div>
                    <div 
                      className="journey-label" 
                      style={{ display: "block", marginTop: "6px", width: "100%", textAlign: "center", color: journeyStep >= 2 ? "#0f766e" : "#64748b", fontSize: "9px", lineHeight: "11px", fontWeight: journeyStep >= 2 ? 600 : 500, whiteSpace: "nowrap" }}
                    >
                      En Route
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div 
                    className={`journey-step ${journeyStep >= 3 ? (journeyStep === 3 ? "active" : "completed") : ""}`} 
                    style={{ position: "relative", width: "25%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible", zIndex: 2 }}
                  >
                    <div 
                      className="journey-circle" 
                      style={{ position: "relative", zIndex: 3, width: "22px", height: "22px", minWidth: "22px", minHeight: "22px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: journeyStep >= 3 ? "#14b8a6" : "#ffffff", border: journeyStep >= 3 ? "2px solid #14b8a6" : "2px solid #cbd5e1", color: journeyStep >= 3 ? "#ffffff" : "#64748b", fontSize: "10px", fontWeight: 700, lineHeight: 1, boxShadow: journeyStep === 3 ? "0 0 0 4px rgba(20, 184, 166, 0.12)" : "none" }}
                    >
                      {journeyStep >= 3 ? "✓" : "3"}
                    </div>
                    <div 
                      className="journey-label" 
                      style={{ display: "block", marginTop: "6px", width: "100%", textAlign: "center", color: journeyStep >= 3 ? "#0f766e" : "#64748b", fontSize: "9px", lineHeight: "11px", fontWeight: journeyStep >= 3 ? 600 : 500, whiteSpace: "nowrap" }}
                    >
                      Arrived at Location
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div 
                    className={`journey-step ${journeyStep >= 4 ? (journeyStep === 4 ? "active" : "completed") : ""}`} 
                    style={{ position: "relative", width: "25%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible", zIndex: 2 }}
                  >
                    <div 
                      className="journey-circle" 
                      style={{ position: "relative", zIndex: 3, width: "22px", height: "22px", minWidth: "22px", minHeight: "22px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: journeyStep >= 4 ? "#14b8a6" : "#ffffff", border: journeyStep >= 4 ? "2px solid #14b8a6" : "2px solid #cbd5e1", color: journeyStep >= 4 ? "#ffffff" : "#64748b", fontSize: "10px", fontWeight: 700, lineHeight: 1, boxShadow: journeyStep === 4 ? "0 0 0 4px rgba(20, 184, 166, 0.12)" : "none" }}
                    >
                      {journeyStep >= 4 ? "✓" : "4"}
                    </div>
                    <div 
                      className="journey-label" 
                      style={{ display: "block", marginTop: "6px", width: "100%", textAlign: "center", color: journeyStep >= 4 ? "#0f766e" : "#64748b", fontSize: "9px", lineHeight: "11px", fontWeight: journeyStep >= 4 ? 600 : 500, whiteSpace: "nowrap" }}
                    >
                      Patient Reached
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 4 — LIVE UPDATES */}
              <div className="rounded-[14px] border border-[#E3EEEC] bg-white p-2 shadow-[0_4px_20px_rgba(20,70,65,0.05)] flex-1 min-h-[70px] flex flex-col overflow-hidden">
                <h3 className="text-[9.5px] font-bold text-[#16232D] uppercase tracking-[.7px] shrink-0 mb-1">LIVE UPDATES</h3>
                <div className="space-y-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                  {logs.map((log, idx) => (
                    <div key={idx} className="flex items-start space-x-1.5 text-[9.5px]">
                      <span className="text-[8px] font-mono text-[#7A8790] whitespace-nowrap pt-0.5">{log.timestamp}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#19B5B1] shrink-0 mt-1"></span>
                      <span className="text-[#16232D] font-medium leading-normal">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTION BUTTONS (HEIGHT 34PX) */}
              <div className="space-y-1 shrink-0 pt-0.5">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(window.location.href);
                        alert("Live tracking URL copied to clipboard.");
                      }
                    }}
                    className="h-[34px] bg-[#19B5B1] hover:bg-[#087F7B] text-white rounded-[8px] font-bold text-[10.5px] shadow-2xs transition-all flex items-center justify-center space-x-1"
                  >
                    <span>🔗</span>
                    <span>Share Location</span>
                  </button>
                  <button 
                    onClick={() => alert("Emergency contacts updated.")}
                    className="h-[34px] bg-white hover:bg-[#EAF9F7] border border-[#E3EEEC] text-[#16232D] rounded-[8px] font-bold text-[10.5px] shadow-2xs transition-all flex items-center justify-center space-x-1"
                  >
                    <span>👨‍👩‍👧</span>
                    <span>Contacts</span>
                  </button>
                </div>

                <button 
                  onClick={handleCancelRequest}
                  className="w-full h-[34px] bg-white hover:bg-[#FFF1F1] border border-[#F3D3D3] text-[#E76F6F] rounded-[8px] font-bold text-[10.5px] shadow-2xs transition-all text-center"
                >
                  ✕ Cancel Request
                </button>
              </div>
            </div>

            {/* RIGHT SIDE MAP PANEL (~52% WIDE WITH ESTIMATED ARRIVAL OVERLAY) */}
            <div className="w-full h-[320px] sm:h-[420px] lg:h-full min-h-[280px] bg-white rounded-[16px] border border-[#DCEAE7] overflow-hidden relative shadow-2xs flex flex-col p-1 mt-2 lg:mt-0">
              <div className="absolute top-2.5 left-2.5 z-20 bg-white/95 backdrop-blur-xs border border-[#E3EEEC] shadow-2xs rounded-full px-2.5 py-0.5 text-[9px] font-bold text-[#16232D] flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22B573] animate-ping"></span>
                <span>Live Tracking</span>
              </div>

              <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden">
                <MapComponent
                  key="tracking-leaflet-map"
                  userCoords={incident ? { latitude: incident.latitude, longitude: incident.longitude } : null}
                  userAddress="Patient Location"
                  hospitals={hospital ? [hospital] : []}
                  selectedHospital={hospital}
                  dispatchedAmbulance={simulatedAmbulancePos ? {
                    id: "1",
                    number: dispatchedAmbulance?.number || "AMB-204",
                    status: "DISPATCHED",
                    latitude: simulatedAmbulancePos[0],
                    longitude: simulatedAmbulancePos[1],
                    speed: "48 km/h"
                  } : dispatchedAmbulance}
                  dispatchStatus="DISPATCHED"
                  routeCoords={routeCoords}
                />
              </div>

              {/* FLOATING ESTIMATED ARRIVAL OVERLAY CARD IN LOWER RIGHT */}
              <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md border border-[#E3EEEC] shadow-md rounded-xl p-2.5 z-20 text-center min-w-[140px]">
                <div className="text-[8px] font-bold text-[#7A8790] uppercase tracking-wider">ESTIMATED ARRIVAL</div>
                <div className="text-base font-extrabold text-[#19B5B1] my-0.5">{simulatedEta}</div>
                <div className="text-[9.5px] font-semibold text-[#16232D]">{simulatedDistance} away</div>
                <div className="text-[8px] text-[#7A8790] mt-0.5 italic">Help is on the way.</div>
              </div>
            </div>
          </section>

          {/* 4. SLIM SAFETY STRIP & FOOTER WITH BREATHING ROOM */}
          <div className="w-full py-1 text-center shrink-0">
            <div className="text-xs font-bold text-[#22B573] flex items-center justify-center space-x-1.5">
              <span>🛡</span>
              <span>Your safety is our priority. We're here for you 💚</span>
            </div>
          </div>

          {/* Compact Page Footer */}
          <footer className="w-full border-t border-[#E3EEEC] bg-white py-2 px-6 text-center text-xs text-[#6B7780] shrink-0">
            CuraNode Emergency Telemetry Network &copy; {new Date().getFullYear()} — All Rights Reserved.
          </footer>
        </main>
      )}
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={
      <div className="w-full h-[100dvh] bg-[#F8FBFA] flex items-center justify-center">
        <div className="animate-pulse font-bold text-xs text-[#6B7780]">Initializing Tracking Session...</div>
      </div>
    }>
      <TrackingContent />
    </Suspense>
  );
}
