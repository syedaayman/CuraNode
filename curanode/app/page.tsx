"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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
}

export default function Home() {
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Camera & Image states
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use a ref for the stream to avoid re-triggering useEffects on state change (fixes AbortError)
  const streamRef = useRef<MediaStream | null>(null);
  
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Analysis states
  const [showResults, setShowResults] = useState(false);

  // Supabase Data States
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);

  // Stop camera stream safely without causing re-renders
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    // Clear the video element's srcObject to prevent it from holding a reference
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Determine initial facing mode based on user agent
  const getInitialFacingMode = useCallback((): "environment" | "user" => {
    if (typeof window !== "undefined") {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      return isMobile ? "environment" : "user";
    }
    return "environment";
  }, []);

  // Initialize facing mode once on mount
  useEffect(() => {
    setFacingMode(getInitialFacingMode());
  }, [getInitialFacingMode]);

  // Start camera stream (wrapped in useCallback to prevent infinite loops)
  const startCamera = useCallback(async (currentFacingMode: "environment" | "user") => {
    stopCamera(); // Safely stop any existing stream first
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
          // Ignore AbortError as it's expected if the user rapidly switches cameras or closes modal
          if (e.name !== "AbortError") {
            console.error("Play failed", e);
          }
        }
      }
    } catch (err: any) {
      console.warn(`Camera with facingMode ${currentFacingMode} failed, trying fallback...`, err);
      // Fallback: request any available camera without facingMode constraint
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
        
        streamRef.current = fallbackStream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          try {
            await videoRef.current.play();
          } catch (e: any) {
            if (e.name !== "AbortError") {
              console.error("Fallback play failed", e);
            }
          }
        }
      } catch (fallbackErr: any) {
        console.error("Fallback camera also failed:", fallbackErr);
        setCameraError("Unable to access camera. Please check your device permissions.");
      }
    }
  }, [stopCamera]);

  // Handle modal open/close
  const handleOpenModal = () => {
    setIsModalOpen(true);
    setImagePreview(null);
    setHospitals([]);
    setShowResults(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    stopCamera();
  };

  // Cleanup strictly on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // This useEffect ensures the camera ONLY starts once when needed
  useEffect(() => {
    if (isModalOpen && !imagePreview) {
      startCamera(facingMode);
    } else {
      // If modal is closed or we are previewing an image, stop the camera to save resources
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
      
      // Ensure video has loaded metadata before capturing
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      
      // Set canvas dimensions to match video stream
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Handle mirroring if front camera is used so capture matches preview
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

  const handleAnalyze = async () => {
    if (!imagePreview) return;
    
    console.log("Analyze clicked");

    setShowResults(true);
    setLoading(true);

    // TODO: Replace with AI model later
    const aiResult = null;

    const { data, error } = await supabase
      .from("hospitals")
      .select("*");

    console.log("DATA:", data);
    console.log("ERROR:", error);

    if (data) {
      setHospitals(data as Hospital[]);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header */}
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            C
          </div>
          <h1 className="text-xl font-medium text-blue-700 tracking-tight">Curanode</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-10">
          <div>
            <h2 className="text-3xl font-semibold text-slate-800 mb-3 tracking-tight">Emergency Assistance</h2>
            <p className="text-slate-500 leading-relaxed">
              Capture the situation securely for immediate AI-assisted triage and hospital routing.
            </p>
          </div>
          
          <button
            onClick={handleOpenModal}
            className="w-full py-5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/30"
          >
            Report Emergency
          </button>
        </div>
      </main>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-medium text-slate-800">
                {showResults ? "Emergency Results" : "Capture Emergency Image"}
              </h3>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-2 transition-colors focus:outline-none"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              {!showResults ? (
                <div className="space-y-6">
                  
                  {/* Camera or Image Preview */}
                  {!imagePreview ? (
                    <div className="space-y-4">
                      {cameraError ? (
                        <div className="border-2 border-dashed border-red-300 bg-red-50 rounded-xl p-8 flex flex-col items-center justify-center text-center">
                          <svg className="w-10 h-10 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                          </svg>
                          <p className="text-red-700 font-medium mb-4">{cameraError}</p>
                          <button 
                            onClick={() => startCamera(facingMode)}
                            className="px-4 py-2 bg-white border border-red-200 rounded-md text-red-600 font-medium hover:bg-red-50 transition-colors"
                          >
                            Retry Camera
                          </button>
                        </div>
                      ) : (
                        <div className="relative rounded-xl overflow-hidden bg-black shadow-inner aspect-[3/4] sm:aspect-square md:aspect-[4/3] flex items-center justify-center">
                          {/* Live Video Stream */}
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted
                            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                          />
                          
                          {/* Top Controls Overlay */}
                          <div className="absolute top-0 left-0 right-0 p-4 flex justify-end bg-gradient-to-b from-black/50 to-transparent">
                            <button
                              onClick={handleSwitchCamera}
                              className="bg-black/40 hover:bg-black/60 text-white rounded-full p-2.5 backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                              title="Switch Camera"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                              </svg>
                            </button>
                          </div>
                          
                          {/* Bottom Controls Overlay */}
                          <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center bg-gradient-to-t from-black/60 to-transparent">
                            <button
                              onClick={handleCapture}
                              className="w-16 h-16 rounded-full border-4 border-white/80 bg-white/20 flex items-center justify-center hover:bg-white/40 hover:border-white transition-all focus:outline-none focus:ring-4 focus:ring-white/50"
                            >
                              <div className="w-12 h-12 rounded-full bg-white"></div>
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Hidden canvas for capturing the image */}
                      <canvas ref={canvasRef} className="hidden" />

                      {/* File Upload Fallback UI */}
                      <div className="text-center mt-3">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[13px] text-blue-600 hover:text-blue-800 font-medium transition-colors focus:outline-none focus:underline"
                        >
                          Upload from gallery instead
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 aspect-[3/4] sm:aspect-square md:aspect-[4/3] flex items-center justify-center">
                        <img 
                          src={imagePreview} 
                          alt="Captured emergency preview" 
                          className={`w-full h-full object-cover`}
                        />
                        <button
                          onClick={handleRetake}
                          className="absolute top-3 right-3 bg-slate-900/70 text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-slate-900/90 backdrop-blur-md transition-colors focus:outline-none"
                        >
                          Retake Photo
                        </button>
                      </div>
                      
                      <button 
                        onClick={handleAnalyze}
                        className="w-full py-4 rounded-lg text-white font-medium text-[15px] transition-all flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-blue-500/30 bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg"
                      >
                        Analyze Emergency
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-slate-500 font-medium text-[15px]">Analyzing & matching hospitals...</p>
                    </div>
                  ) : hospitals && hospitals.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <h3 className="font-semibold text-slate-800 text-[17px] tracking-tight">Recommended Hospitals</h3>
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">{hospitals.length} Found</span>
                      </div>
                      
                      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                        {hospitals.map((hospital, index) => (
                          <div key={hospital.id || index} className="relative bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
                            {/* Rank Badge */}
                            <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-sm border-2 border-white text-sm">
                              {index + 1}
                            </div>
                            
                            <div className="ml-2">
                              <h4 className="text-base font-semibold text-slate-900 leading-tight">{hospital.name}</h4>
                              <p className="text-sm text-slate-500 mt-1 line-clamp-1">{hospital.city}</p>
                              
                              <div className="flex flex-wrap gap-2 mt-3.5">
                                {hospital.available_beds !== undefined && (
                                  <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-[13px] font-medium border border-emerald-100">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                                    <span>{hospital.available_beds} Beds</span>
                                  </div>
                                )}
                                {hospital.has_icu && (
                                  <div className="flex items-center space-x-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-[13px] font-medium border border-amber-100">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                                    <span>ICU Available</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      </div>
                      <h3 className="text-lg font-medium text-slate-900 mb-1">No Hospitals Found</h3>
                      <p className="text-slate-500 text-[15px] max-w-[250px]">We couldn&apos;t find any hospitals matching your criteria at this moment.</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setShowResults(false);
                        setImagePreview(null);
                        setHospitals([]);
                        startCamera(facingMode);
                      }}
                      className="w-full py-3.5 mt-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors focus:outline-none focus:ring-4 focus:ring-slate-100"
                    >
                      Analyze Another Case
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
