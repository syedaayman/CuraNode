"use client";

import React from "react";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function Logo({ className = "", iconOnly = false, size = "md" }: LogoProps) {
  const iconSizes = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11"
  };

  const textSizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl"
  };

  const subSizes = {
    sm: "text-[8px]",
    md: "text-[9px]",
    lg: "text-[11px]"
  };

  return (
    <div className={`flex items-center space-x-2.5 ${className}`}>
      {/* Icon: CuraNode Primary Teal (#19B5B1) rounded container with Heart + Medical Cross */}
      <div className={`${iconSizes[size]} bg-gradient-to-br from-[#19B5B1] to-[#087F7B] rounded-xl flex items-center justify-center shadow-xs text-white p-1.5 shrink-0`}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-white" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {/* Heart Outline */}
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="currentColor" fillOpacity="0.25" />
          {/* Centered Medical Cross */}
          <path d="M12 7.5v5m-2.5-2.5h5" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>

      {!iconOnly && (
        <div className="flex flex-col leading-none text-left">
          <span className={`font-bold ${textSizes[size]} text-[#16232D] tracking-tight`}>
            Cura<span className="text-[#19B5B1]">Node</span>
          </span>
          <span className={`${subSizes[size]} font-semibold text-[#6B7780] tracking-wider uppercase mt-0.5`}>
            INTELLIGENT EMERGENCY CARE
          </span>
        </div>
      )}
    </div>
  );
}
