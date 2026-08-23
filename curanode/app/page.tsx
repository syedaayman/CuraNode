"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentLocation } from "@/lib/geolocation";
import { reverseGeocodeCoords } from "@/lib/reverseGeocode";
import { fetchAllHospitals } from "@/services/hospitalService";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { TrackingContent } from "./tracking/page";
import { API_BASE_URL } from "@/lib/config";
import Logo from "@/components/Logo";

export interface Hospital {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  has_icu: boolean;
  has_trauma_care: boolean;
  available_beds: number;
  icu_beds: number;
  average_response_time: number;
  contact_number: string;
  rating: number;
  distance?: number;
  estimated_travel_time?: number;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MapComponent = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#F4FAF9] text-[#71858A]">
      <svg className="animate-spin h-8 w-8 text-[#3F9EAD] mb-2" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span className="text-xs font-medium text-[#71858A]">Initializing Leaflet Mapping Layer...</span>
    </div>
  )
});

export default function Home() {
  const router = useRouter();
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Camera & Image states
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Analysis states
  const [showResults, setShowResults] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [showLocationDeniedDialog, setShowLocationDeniedDialog] = useState(false);

  // Supabase Data States
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<{ severity_score: number; severity_level: string; confidence: number; analysis: string } | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Dispatch States
  const [dispatchStatus, setDispatchStatus] = useState<"idle" | "pending" | "dispatched" | "at_patient" | "transporting" | "completed">("idle");
  const [dispatchedAmbulance, setDispatchedAmbulance] = useState<any>(null);
  const [dispatchEta, setDispatchEta] = useState<string | null>(null);
  const [dispatchDistance, setDispatchDistance] = useState<string | null>(null);

  // Geolocation & Mapping States
  const [userAddress, setUserAddress] = useState<string>("Locating device position...");
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [routeDetails, setRouteDetails] = useState<{ distance: string; duration: string } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const getInitialFacingMode = useCallback((): "environment" | "user" => {
    if (typeof window !== "undefined") {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      return isMobile ? "environment" : "user";
    }
    return "environment";
  }, []);

  useEffect(() => {
    setFacingMode(getInitialFacingMode());
  }, [getInitialFacingMode]);

  useEffect(() => {
    const loadHospitals = async () => {
      try {
        const list = await fetchAllHospitals();
        const validList = list.filter((h) => {
          const rawLat = h.latitude;
          const rawLng = h.longitude;
          if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) return false;
          const lat = typeof rawLat === "string" ? parseFloat(rawLat) : rawLat;
          const lng = typeof rawLng === "string" ? parseFloat(rawLng) : rawLng;
          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
          h.latitude = lat;
          h.longitude = lng;
          return true;
        });
        setAllHospitals(validList);
      } catch (err) {
        console.error("Could not fetch hospital coordinates:", err);
      }
    };
    loadHospitals();
  }, []);

  const initLocation = useCallback(async () => {
    try {
      const coords = await getCurrentLocation();
      setUserLocation(coords);
      setLocationError(null);
      setShowLocationDeniedDialog(false);
      
      try {
        const addr = await reverseGeocodeCoords(coords.latitude, coords.longitude);
        setUserAddress(addr);
      } catch (e) {
        setUserAddress(`Lat: ${coords.latitude.toFixed(4)}, Lon: ${coords.longitude.toFixed(4)}`);
      }
    } catch (err: any) {
      console.error("Location resolution error:", err);
      setLocationError(err.message || "Failed to retrieve location.");
      
      setUserLocation(null);
      setUserAddress("Location unavailable");
      setShowLocationDeniedDialog(true);
    }
  }, []);

  useEffect(() => {
    initLocation();
  }, [initLocation]);

  const handleRetryLocation = () => {
    initLocation();
  };

  const startCamera = useCallback(async (currentFacingMode: "environment" | "user") => {
    stopCamera();
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode }
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch (e: any) {
          if (e.name !== "AbortError") console.error("Play failed", e);
        }
      }
    } catch (err: any) {
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          try {
            await videoRef.current.play();
          } catch (e: any) {
            if (e.name !== "AbortError") console.error("Fallback play failed", e);
          }
        }
      } catch (fallbackErr: any) {
        setCameraError("Unable to access camera device. Please check permissions.");
      }
    }
  }, [stopCamera]);

  const handleOpenModal = () => {
    if (!userLocation) {
      setShowLocationDeniedDialog(true);
      return;
    }
    setIsModalOpen(true);
    setImagePreview(null);
    setHospitals([]);
    setSelectedHospital(null);
    setShowResults(false);
  };

  const handleCloseModal = () => {
    if (showTracking) {
      const confirmClose = window.confirm("Close tracking panel? Request will continue active response monitoring.");
      if (!confirmClose) return;
      setShowTracking(false);
    }
    setIsModalOpen(false);
    stopCamera();
    setIncidentId(null);
    setDispatchStatus("idle");
    setDispatchedAmbulance(null);
    setDispatchEta(null);
    setDispatchDistance(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (isModalOpen && !imagePreview) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
  }, [facingMode, isModalOpen, imagePreview, startCamera, stopCamera]);

  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        if (facingMode === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setImagePreview(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetake = () => {
    setImagePreview(null);
    setHospitals([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openGoogleMapsSearch = (hospital: Hospital) => {
    if (!hospital || !hospital.name || hospital.name.trim() === "") {
      alert("Selected hospital details incomplete. Unable to build Google Maps query.");
      return;
    }
    const queryParts = [hospital.name.trim()];
    if (hospital.address && hospital.address.trim()) queryParts.push(hospital.address.trim());
    if (hospital.city && hospital.city.trim()) queryParts.push(hospital.city.trim());
    if (hospital.state && hospital.state.trim()) queryParts.push(hospital.state.trim());

    const searchQuery = queryParts.join(", ");
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
    window.open(mapsUrl, "_blank");
  };

  const handleAnalyze = async () => {
    if (!imagePreview) return;

    setShowResults(true);
    setLoading(true);
    setAnalysisError(null);

    let currentSeverityScore = 5;
    let currentSeverityLevel = "Medium";
    let fetchedHospitals: Hospital[] | null = null;

    try {
      const response = await fetch(imagePreview);
      const blob = await response.blob();
      const file = new File([blob], "injury.jpg", { type: "image/jpeg" });
      
      let loc = userLocation;
      if (!loc) {
        try {
          loc = await getCurrentLocation();
          setUserLocation(loc);
        } catch (e) {
          console.warn("GPS resolution fallback during analysis:", e);
        }
      }

      const formData = new FormData();
      formData.append("file", file);
      if (loc) {
        formData.append("latitude", loc.latitude.toString());
        formData.append("longitude", loc.longitude.toString());
      }
      
      let apiResponse: Response;
      try {
        apiResponse = await fetch(`${API_BASE_URL}/predict`, {
          method: "POST",
          body: formData,
        });
      } catch (fetchErr: any) {
        console.error("Network/CORS fetch error reaching backend /predict:", fetchErr);
        throw new Error(`Failed to fetch: Unable to reach backend at ${API_BASE_URL}/predict. Please check backend server status and CORS configuration.`);
      }

      if (!apiResponse.ok) {
        let detailMsg = `HTTP ${apiResponse.status} ${apiResponse.statusText}`;
        try {
          const errData = await apiResponse.json();
          if (errData.detail) {
            detailMsg += `: ${typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail)}`;
          }
        } catch (e) {
          // Ignore JSON parse error on non-200 responses
        }
        throw new Error(`AI Triage API Error (${detailMsg})`);
      }
      
      let result: any;
      try {
        result = await apiResponse.json();
      } catch (jsonErr) {
        throw new Error(`Invalid response format from AI prediction service at ${API_BASE_URL}/predict`);
      }

      if (!result || typeof result.severity_score !== "number") {
        throw new Error("AI prediction response missing required severity fields.");
      }

      currentSeverityScore = result.severity_score;
      currentSeverityLevel = result.severity_level;
      setIncidentId(result.incident_id);
      setPrediction({
        severity_score: result.severity_score,
        severity_level: result.severity_level,
        confidence: result.confidence,
        analysis: result.analysis
      });
      if (result.hospitals) {
        fetchedHospitals = result.hospitals;
      }
    } catch (err: any) {
      console.error("AI Prediction API Error:", err);
      setAnalysisError(err.message || "Failed to analyze injury with AI model.");
    }

    if (fetchedHospitals) {
      const validFetched = fetchedHospitals.filter((h) => {
        const rawLat = h.latitude;
        const rawLng = h.longitude;
        if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) return false;
        const lat = typeof rawLat === "string" ? parseFloat(rawLat) : rawLat;
        const lng = typeof rawLng === "string" ? parseFloat(rawLng) : rawLng;
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        h.latitude = lat;
        h.longitude = lng;
        return true;
      });
      setHospitals(validFetched);
      if (validFetched.length > 0) {
        setSelectedHospital(null);
      }
    } else {
      const { data } = await supabase.from("hospitals").select("*");
      if (data) {
        const seenIds = new Set();
        const seenNames = new Set();
        const unique = (data as Hospital[]).filter(h => {
          if (!h.id || seenIds.has(h.id)) return false;
          const nameLower = (h.name || "").trim().toLowerCase();
          if (seenNames.has(nameLower)) return false;
          seenIds.add(h.id);
          seenNames.add(nameLower);
          return true;
        });

        const validFallback = unique.filter((h) => {
          const rawLat = h.latitude;
          const rawLng = h.longitude;
          if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) return false;
          const lat = typeof rawLat === "string" ? parseFloat(rawLat) : rawLat;
          const lng = typeof rawLng === "string" ? parseFloat(rawLng) : rawLng;
          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
          h.latitude = lat;
          h.longitude = lng;
          return true;
        });

        const patientLat = userLocation?.latitude ?? 13.0827;
        const patientLon = userLocation?.longitude ?? 80.2707;

        const processed = validFallback.map(h => {
          const dist = getDistance(patientLat, patientLon, h.latitude, h.longitude);
          return {
            ...h,
            distance: parseFloat(dist.toFixed(1)),
            estimated_travel_time: Math.max(2, Math.round(dist * 1.5))
          };
        });

        if (currentSeverityScore >= 9) {
          processed.sort((a, b) => {
            const getTier = (h: Hospital) => {
              if (h.has_icu && h.has_trauma_care) return 0;
              if (h.has_icu) return 1;
              if (h.has_trauma_care) return 2;
              return 3;
            };
            const diff = getTier(a) - getTier(b);
            if (diff !== 0) return diff;
            return (a.distance || 0) - (b.distance || 0);
          });
        } else {
          processed.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        }

        setHospitals(processed.slice(0, 3));
        setSelectedHospital(null);
      }
    }

    setLoading(false);
  };

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
      }
    } catch (e) {
      console.warn("Sound synthesis warning:", e);
    }
  }, []);

  const handleRequestHospital = async () => {
    if (!selectedHospital || !incidentId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/request-hospital`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident_id: incidentId,
          hospital_id: selectedHospital.id,
          hospital_name: selectedHospital.name
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Hospital request selection failed.");
      }

      playSound("success");
      router.push(`/tracking?incidentId=${incidentId}&hospitalId=${selectedHospital.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to request emergency routing.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen sm:h-[100dvh] sm:max-h-[100dvh] bg-[#F8FFFD] text-[#16232D] font-sans flex flex-col justify-between overflow-x-hidden sm:overflow-hidden relative select-none">
      {/* Soft Background Radial Teal Glow & Faint Grid */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="w-[800px] h-[800px] rounded-full bg-[#19B5B1]/08 blur-[130px] -top-32 -right-32 absolute"></div>
        <div className="w-[550px] h-[550px] rounded-full bg-[#22B573]/06 blur-[110px] bottom-0 -left-20 absolute"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#19B5B1_1px,transparent_1px)] [background-size:40px_40px] opacity-[0.03]"></div>
      </div>

      {/* 1. Minimal Product Header (Height 64px) */}
      <header className="w-full h-[64px] min-h-[64px] max-h-[64px] bg-white/95 backdrop-blur-md border-b border-[#E1F2EE] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs shrink-0">
        <Logo size="md" />

        {/* Device GPS Status Badge */}
        <div className="flex items-center space-x-2 bg-[#EAF8F5] border border-[#BDE9E4] px-2.5 sm:px-3.5 py-1.5 rounded-full shadow-2xs max-w-[180px] sm:max-w-[260px]">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22B573] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22B573]"></span>
          </span>
          <span className="text-[11px] sm:text-xs text-[#112F35] font-extrabold truncate">
            {userAddress || "Live GPS Active"}
          </span>
        </div>
      </header>

      {/* 2. Two-Column Editorial Hero Section */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center relative z-10 overflow-y-auto sm:overflow-hidden min-h-0">
        
        {/* LEFT COLUMN: Typography & Primary Action (Col Span 7) */}
        <div className="lg:col-span-7 space-y-4 sm:space-y-6 text-left">
          
          {/* Eyebrow Status Badge */}
          <div className="inline-flex items-center space-x-2 bg-white/95 backdrop-blur-xs border border-[#BDE9E4] px-3.5 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold text-[#087F7B] shadow-2xs tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-[#22B573] animate-pulse"></span>
            <span>AI-POWERED EMERGENCY RESPONSE</span>
          </div>
          
          {/* Elegant Display Headline (Font Weight ~650-700) */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl lg:text-[48px] font-bold text-[#112F35] tracking-tight leading-[1.15]">
              Rapid Medical <br className="hidden sm:inline" />
              <span className="text-[#087F7B] font-extrabold">Emergency Triage</span>
            </h1>
            <p className="text-[#475569] text-sm sm:text-base lg:text-[17px] leading-relaxed max-w-xl font-medium pt-0.5">
              AI-assisted injury severity assessment, real-time care facility matching, and automated 5-minute emergency response.
            </p>
          </div>
          
          {/* Primary Action CTA & Status Badge */}
          <div className="pt-1 space-y-3">
            <button
              onClick={handleOpenModal}
              className="group w-full sm:w-auto h-[48px] sm:h-[50px] px-6 sm:px-8 bg-gradient-to-r from-[#19B5B1] to-[#087F7B] hover:from-[#087F7B] hover:to-[#066562] text-white rounded-xl font-bold text-sm sm:text-base shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-[#19B5B1]/20 active:scale-[0.99] flex items-center justify-center space-x-3 hover:-translate-y-0.5 cursor-pointer"
            >
              <span>Initiate Medical Emergency Triage</span>
              <svg 
                className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200 shrink-0" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </button>

            <div className="flex items-center space-x-2 text-[11px] sm:text-xs font-semibold text-[#087F7B] bg-[#EAF8F5] px-3.5 py-1.5 rounded-full border border-[#BDE9E4] inline-flex shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-[#22B573] animate-ping shrink-0"></span>
              <span>Live GPS telemetry active · Emergency departments online</span>
            </div>
          </div>

          {/* Minimal Feature Strip */}
          <div className="pt-4 sm:pt-5 border-t border-[#BDE9E4]/60 grid grid-cols-2 sm:flex items-center justify-between text-[11px] sm:text-xs font-semibold text-[#475569] gap-2 sm:gap-0 max-w-xl">
            <span className="flex items-center space-x-1.5"><span className="text-[#19B5B1]">●</span><span>AI Triage</span></span>
            <span className="text-[#CBD5E1] hidden sm:inline">•</span>
            <span className="flex items-center space-x-1.5"><span className="text-[#19B5B1]">●</span><span>Live GPS</span></span>
            <span className="text-[#CBD5E1] hidden sm:inline">•</span>
            <span className="flex items-center space-x-1.5"><span className="text-[#19B5B1]">●</span><span>Hospital Matching</span></span>
            <span className="text-[#CBD5E1] hidden sm:inline">•</span>
            <span className="flex items-center space-x-1.5"><span className="text-[#19B5B1]">●</span><span>5-Min Response</span></span>
          </div>

        </div>

        {/* RIGHT COLUMN: Minimal & Airy Decorative AI Visual (Col Span 5) */}
        <div className="lg:col-span-5 flex justify-center items-center relative py-4 lg:py-0">
          
          <div className="w-full max-w-[300px] sm:max-w-[360px] aspect-square relative flex items-center justify-center pointer-events-none mx-auto">
            {/* Soft Concentric Radar Rings */}
            <div className="absolute inset-0 rounded-full border border-[#19B5B1]/15 animate-spin [animation-duration:40s]"></div>
            <div className="absolute inset-8 rounded-full border border-dashed border-[#19B5B1]/25 animate-spin [animation-duration:26s] [animation-direction:reverse]"></div>
            <div className="absolute inset-16 rounded-full bg-gradient-to-tr from-[#19B5B1]/12 to-transparent blur-xl"></div>
            
            {/* Central CuraNode AI Core Card */}
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-[24px] sm:rounded-[28px] bg-white/95 border border-[#BDE9E4] shadow-[0_12px_36px_rgba(25,181,177,0.12)] backdrop-blur-md flex flex-col items-center justify-center p-4 space-y-2 relative z-10 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#EAF8F5] to-[#E6F7F2] border border-[#BDE9E4] flex items-center justify-center text-[#19B5B1] text-2xl sm:text-3xl shadow-2xs">
                🏥
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-[#112F35] uppercase tracking-wider">CuraNode AI</span>
              <span className="text-[9px] sm:text-[9.5px] font-extrabold text-[#087F7B] bg-[#EAF8F5] border border-[#BDE9E4] px-2.5 sm:px-3 py-0.5 rounded-full uppercase tracking-wider">
                RESPONSE CORE
              </span>
            </div>

            {/* Exactly 3 Floating Micro Indicators */}
            {/* 1. Top Indicator */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white/95 border border-[#BDE9E4] shadow-sm px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold text-[#112F35] flex items-center space-x-1.5 backdrop-blur-xs">
              <span className="w-2 h-2 rounded-full bg-[#22B573] animate-ping shrink-0"></span>
              <span>LIVE GPS</span>
            </div>

            {/* 2. Bottom Left Indicator */}
            <div className="absolute bottom-2 -left-2 sm:-left-4 bg-white/95 border border-[#BDE9E4] shadow-sm px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold text-[#087F7B] flex items-center space-x-1.5 backdrop-blur-xs">
              <span className="text-xs">🏥</span>
              <span>HOSPITAL MATCHED</span>
            </div>

            {/* 3. Bottom Right Indicator */}
            <div className="absolute bottom-2 -right-2 sm:-right-4 bg-white/95 border border-[#BDE9E4] shadow-sm px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold text-[#22B573] flex items-center space-x-1.5 backdrop-blur-xs">
              <span className="text-xs">⚡</span>
              <span>5-MIN RESPONSE</span>
            </div>
          </div>

        </div>

      </main>

      {/* 3. Minimal Product Footer */}
      <footer className="w-full bg-white/90 backdrop-blur-xs border-t border-[#E1F2EE] px-4 sm:px-6 py-3 text-center text-[11px] sm:text-xs text-[#64748B] font-medium shrink-0 z-10">
        CuraNode Emergency Telemetry Network &copy; {new Date().getFullYear()} — Active Emergency Platform
      </footer>



      {/* Main Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20343B]/40 backdrop-blur-xs p-3 sm:p-4">
          <div className={`rounded-2xl shadow-xl w-full ${showTracking ? "max-w-5xl max-h-[92vh]" : showResults ? "max-w-2xl max-h-[88vh]" : "max-w-md max-h-[92vh]"} overflow-hidden flex flex-col ${showTracking ? "bg-[#20343B] text-white" : "bg-white text-[#20343B] border border-[#E2E8F0]"} transition-all duration-200`}>
            
            {/* Modal Header */}
            <div className={`px-5 py-3 border-b flex justify-between items-center shrink-0 ${showTracking ? "border-[#71858A]/30 bg-[#20343B]" : "border-[#E2E8F0] bg-white"}`}>
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#3F9EAD]"></div>
                <h3 className="text-base font-bold tracking-tight text-[#20343B]">
                  {showTracking ? "Emergency Operations Telemetry" : showResults ? "AI Triage & Recommended Facilities" : "Capture Emergency Photo"}
                </h3>
              </div>
              <button 
                onClick={handleCloseModal}
                className="rounded-full p-1.5 text-[#71858A] hover:text-[#20343B] hover:bg-[#F4FAF9] transition-colors focus:outline-none cursor-pointer"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className={`flex-1 min-h-0 flex flex-col overflow-hidden ${showResults ? "p-4 sm:p-5" : "p-5 sm:p-6 overflow-y-auto custom-scrollbar"}`}>
              {showTracking ? (
                <TrackingContent incidentId={incidentId} hospitalId={selectedHospital?.id} />
              ) : !showResults ? (
                <div className="space-y-4">
                  {!imagePreview ? (
                    <div className="space-y-3.5">
                      {cameraError ? (
                        <div className="border border-rose-200 bg-rose-50 rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-2">
                          <p className="text-rose-700 font-medium text-xs">{cameraError}</p>
                          <button 
                            onClick={() => startCamera(facingMode)}
                            className="px-4 py-1.5 bg-white border border-rose-200 rounded-lg text-rose-600 font-bold text-xs hover:bg-rose-50 transition-colors shadow-2xs cursor-pointer"
                          >
                            Retry Camera
                          </button>
                        </div>
                      ) : (
                        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 shadow-inner aspect-[4/3] flex items-center justify-center border border-[#E2E8F0]">
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted
                            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                          />
                          
                          {/* Top-Right Camera Switch Control */}
                          <div className="absolute top-3 right-3 z-10">
                            <button
                              onClick={handleSwitchCamera}
                              className="bg-black/40 hover:bg-black/60 text-white rounded-full p-2.5 backdrop-blur-xs border border-white/20 transition-all shadow-xs cursor-pointer active:scale-95 flex items-center justify-center"
                              title="Switch Camera"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                              </svg>
                            </button>
                          </div>
                          
                          {/* Bottom Centered Shutter Button */}
                          <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10">
                            <button
                              onClick={handleCapture}
                              className="w-14 h-14 rounded-full border-4 border-white/95 bg-white/25 hover:bg-white/40 flex items-center justify-center transition-all duration-200 active:scale-95 shadow-md cursor-pointer"
                              title="Capture Photo"
                            >
                              <div className="w-10 h-10 rounded-full bg-white shadow-xs"></div>
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <canvas ref={canvasRef} className="hidden" />

                      {/* Small Helpful Instruction */}
                      <p className="text-[11.5px] text-[#64748B] font-medium text-center">
                        Capture a clear photo for AI injury assessment
                      </p>

                      {/* Divider */}
                      <div className="relative flex py-0.5 items-center justify-center">
                        <div className="flex-grow border-t border-[#E2E8F0]"></div>
                        <span className="flex-shrink mx-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">or</span>
                        <div className="flex-grow border-t border-[#E2E8F0]"></div>
                      </div>

                      {/* Secondary File Upload */}
                      <div className="text-center">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs text-[#087F7B] hover:text-[#066562] font-extrabold transition-colors focus:outline-none cursor-pointer"
                        >
                          Select image from device
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>

                      {/* Reassuring Secure Indicator */}
                      <div className="text-center pt-0.5">
                        <span className="inline-flex items-center space-x-1.5 text-[10.5px] font-bold text-[#087F7B] bg-[#EAF8F5] px-3 py-0.5 rounded-full border border-[#BDE9E4]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22B573]"></span>
                          <span>Secure emergency upload</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div className="relative rounded-2xl overflow-hidden border border-[#E2E8F0] bg-slate-100 aspect-[4/3] flex items-center justify-center shadow-inner">
                        <img 
                          src={imagePreview} 
                          alt="Captured emergency preview" 
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={handleRetake}
                          className="absolute top-3 right-3 bg-[#112F35]/80 hover:bg-[#112F35] text-white text-xs font-bold rounded-lg px-3 py-1.5 backdrop-blur-xs transition-colors cursor-pointer border border-white/20 shadow-xs"
                        >
                          Retake Photo
                        </button>
                      </div>
                      
                      <button 
                        onClick={handleAnalyze}
                        className="w-full h-[46px] rounded-xl text-white font-extrabold text-sm bg-gradient-to-r from-[#19B5B1] to-[#087F7B] hover:from-[#087F7B] hover:to-[#066562] transition-all shadow-xs hover:shadow-md cursor-pointer flex items-center justify-center space-x-2 active:scale-[0.99]"
                      >
                        <span>Analyze Injury & Severity</span>
                        <span>→</span>
                      </button>

                      {/* Reassuring Secure Indicator */}
                      <div className="text-center pt-0.5">
                        <span className="inline-flex items-center space-x-1.5 text-[10.5px] font-bold text-[#087F7B] bg-[#EAF8F5] px-3 py-0.5 rounded-full border border-[#BDE9E4]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22B573]"></span>
                          <span>Secure emergency upload</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
                  {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-10">
                      <svg className="animate-spin h-10 w-10 text-[#3F9EAD] mb-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-[#71858A] font-semibold text-sm">Evaluating Injury Severity & Ranking Facilities...</p>
                    </div>
                  ) : hospitals && hospitals.length > 0 ? (
                    <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden gap-3 text-left">
                      
                      {/* 1. TOP FULL-WIDTH CARD: AI MEDICAL TRIAGE SCORE */}
                      <div className="bg-[#F4FAF9] rounded-xl p-3.5 border border-[#E2E8F0] text-left shrink-0 space-y-1 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-ui text-[10.5px] font-semibold text-[#087F7B] uppercase tracking-wide">
                            AI MEDICAL TRIAGE SCORE
                          </span>
                          {prediction && (
                            <span className="font-body text-xs font-medium text-[#64748B]">
                              Confidence: {Math.round(prediction.confidence * 100)}%
                            </span>
                          )}
                        </div>

                        {analysisError && (
                          <div className="font-body text-xs text-rose-700 font-medium">{analysisError}</div>
                        )}

                        {prediction && (
                          <>
                            <div className="flex items-center justify-between pt-0.5">
                              <span className="font-ui text-xs font-semibold text-[#112F35]">Severity Level:</span>
                              <span className={`font-ui text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                                prediction.severity_level === "Critical" ? "bg-rose-100 text-rose-700 border-rose-300" :
                                prediction.severity_level === "High" ? "bg-amber-100 text-amber-800 border-amber-300" :
                                prediction.severity_level === "Medium" ? "bg-teal-50 text-[#087F7B] border-[#087F7B]/30" :
                                "bg-emerald-100 text-emerald-800 border-emerald-300"
                              }`}>
                                {prediction.severity_level} ({prediction.severity_score}/10)
                              </span>
                            </div>
                            <p className="font-body text-[11.5px] text-[#475569] font-normal leading-snug pt-0.5">
                              {prediction.analysis}
                            </p>
                          </>
                        )}
                      </div>

                      {/* 2. MAIN SECTION: RANKED NEARBY FACILITIES (ALL 3 VISIBLE) */}
                      <div className="flex-1 min-h-0 flex flex-col overflow-hidden text-left border-t border-[#E2E8F0] pt-2">
                        <div className="flex items-center justify-between mb-1.5 sm:mb-2 shrink-0">
                          <h4 className="font-ui font-semibold text-[#112F35] text-xs uppercase tracking-wide">
                            RANKED NEARBY FACILITIES
                          </h4>
                          <span className="font-body text-[10px] text-[#64748B] font-medium">Distance-based</span>
                        </div>

                        {/* Facility Cards List (All 3 facilities visible, internally scrollable if viewport constrained) */}
                        <div className="flex-1 min-h-0 space-y-2 sm:space-y-2.5 overflow-y-auto custom-scrollbar pr-0.5 flex flex-col justify-start">
                          {hospitals.slice(0, 3).map((hospital, index) => {
                            const isSelected = selectedHospital?.id === hospital.id;
                            return (
                              <div 
                                key={hospital.id || index} 
                                onClick={() => {
                                  setSelectedHospital(hospital);
                                }}
                                className={`relative bg-white border cursor-pointer rounded-xl p-2.5 sm:p-3 shadow-2xs hover:shadow-xs transition-all shrink-0 ${
                                  isSelected ? "border-[#087F7B] ring-2 ring-[#087F7B]/20 bg-[#F4FAF9]/60" : "border-[#E2E8F0] hover:border-[#087F7B]/40"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <span className="font-ui px-2 py-0.5 rounded-md bg-[#087F7B] text-white font-semibold text-xs shrink-0">
                                      #{index + 1}
                                    </span>
                                    <h5 className="font-ui text-xs font-semibold text-[#112F35] truncate leading-tight">{hospital.name}</h5>
                                  </div>
                                  {isSelected && (
                                    <span className="font-ui text-[9.5px] bg-[#EAF8F5] text-[#087F7B] font-semibold px-2.5 py-0.5 rounded-full border border-[#BDE9E4] shrink-0 flex items-center gap-1">
                                      <span>✓</span>
                                      <span>SELECTED</span>
                                    </span>
                                  )}
                                </div>

                                <div className="font-body text-[11px] text-[#64748B] font-normal truncate mt-1">{hospital.address}, {hospital.city}</div>

                                <div className="flex items-center justify-between pt-2 gap-2">
                                  <div className="flex items-center space-x-2 text-[10px] font-medium text-[#112F35] shrink-0">
                                    <span className="font-ui bg-[#F4FAF9] px-2 py-0.5 rounded border border-[#E2E8F0]">
                                      {hospital.distance !== undefined ? `${hospital.distance} km` : "N/A"}
                                    </span>
                                    <span>•</span>
                                    <span className="font-ui text-[#087F7B]">
                                      Est. {hospital.estimated_travel_time !== undefined ? `${hospital.estimated_travel_time} mins` : "N/A"}
                                    </span>
                                    {hospital.has_icu && (
                                      <>
                                        <span>•</span>
                                        <span className="font-ui text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                          ICU Available
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedHospital(hospital);
                                      openGoogleMapsSearch(hospital);
                                    }}
                                    className="font-ui h-[30px] px-3 bg-[#087F7B] hover:bg-[#066562] text-white font-semibold text-[10px] rounded-lg transition-colors shadow-2xs flex items-center justify-center shrink-0 cursor-pointer"
                                  >
                                    Get Directions
                                  </button>
                                </div>

                                {/* CONTEXTUAL EMERGENCY DISPATCH SECTION (APPEARS ONLY WHEN THIS HOSPITAL IS SELECTED AND SEVERITY SCORE >= 4) */}
                                {isSelected && (prediction?.severity_score !== undefined ? prediction.severity_score >= 4 : false) && (
                                  <div 
                                    className="mt-2.5 pt-2.5 border-t border-[#087F7B]/20 bg-rose-50/90 border border-rose-200/80 rounded-lg p-2.5 space-y-1 text-left shadow-2xs animate-in fade-in duration-200"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-ui text-[10px] font-semibold text-rose-700 uppercase tracking-wide flex items-center gap-1">
                                        <span>🚑</span>
                                        <span>EMERGENCY AMBULANCE DISPATCH</span>
                                      </span>
                                      <span className="font-ui text-[9px] font-semibold bg-rose-600 text-white px-2 py-0.5 rounded-full">
                                        Priority 1
                                      </span>
                                    </div>

                                    <p className="font-body text-[10.5px] text-rose-800 leading-tight font-normal">
                                      Request an emergency ambulance from <strong className="font-ui font-semibold text-rose-950">{hospital.name}</strong>.
                                    </p>

                                    <button
                                      onClick={handleRequestHospital}
                                      disabled={loading}
                                      className="font-ui w-full h-[36px] bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white rounded-lg font-semibold text-[11px] shadow-xs hover:shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer mt-1"
                                    >
                                      {loading ? (
                                        <span className="text-xs">Processing Dispatch...</span>
                                      ) : (
                                        <span>REQUEST EMERGENCY AMBULANCE</span>
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* BOTTOM ACTION */}
                      <div className="pt-2 border-t border-[#E2E8F0] shrink-0">
                        <button
                          onClick={() => {
                            setShowResults(false);
                            setImagePreview(null);
                            setHospitals([]);
                            setPrediction(null);
                            setSelectedHospital(null);
                            setRouteDetails(null);
                            setIncidentId(null);
                            setDispatchStatus("idle");
                            setDispatchedAmbulance(null);
                            setDispatchEta(null);
                            setDispatchDistance(null);
                            startCamera(facingMode);
                          }}
                          className="w-full py-2 bg-white border border-[#E2E8F0] hover:bg-[#F4FAF9] text-[#20343B] rounded-xl font-bold text-xs transition-colors cursor-pointer"
                        >
                          New Injury Assessment
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                      <h4 className="text-sm font-semibold text-[#20343B] mb-1">No Facilities Located</h4>
                      <p className="text-[#71858A] text-xs">No matching emergency healthcare facilities found.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Location Permission Modal */}
      {showLocationDeniedDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20343B]/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center space-y-5 border border-[#E2E8F0]">
            <div className="mx-auto w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-[#20343B]">GPS Location Required</h4>
              <p className="text-[#71858A] text-xs leading-relaxed">
                Device GPS access is required to compute precise Haversine facility distances and emergency hospital dispatch routing.
              </p>
            </div>
            <button
              onClick={handleRetryLocation}
              className="w-full py-3 px-4 bg-[#3F9EAD] hover:bg-[#348896] text-white rounded-xl font-bold text-xs shadow-xs transition-all"
            >
              Grant GPS Permission
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
