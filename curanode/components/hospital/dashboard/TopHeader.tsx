'use client';

import { useState, useEffect } from 'react';

export default function TopHeader() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-border-light">
      <div>
        <h1 className="text-[28px] md:text-[34px] font-normal tracking-[-0.02em] text-text-primary flex items-center gap-3" style={{ fontFamily: 'var(--font-serif-display), serif' }}>
          Welcome back, Hospital Admin
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cura-teal-soft text-cura-teal shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
        </h1>
        <p className="text-[15px] md:text-[17px] text-text-secondary mt-1 font-normal">
          Monitor, manage and respond to emergencies in real-time.
        </p>
      </div>
      <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-full shadow-sm border border-border-light">
        <span className="w-2.5 h-2.5 rounded-full bg-cura-teal animate-pulse"></span>
        <span className="text-[13px] font-bold text-text-primary tracking-wide">
          Live &bull; {time || '...'}
        </span>
      </div>
    </div>
  );
}
