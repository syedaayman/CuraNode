'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function EmergencyAlert() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio only on client-side to prevent hydration errors
    audioRef.current = new Audio('/alert-chime.mp3');
  }, []);

  useEffect(() => {
    let retryCount = 0;
    let channel: ReturnType<typeof supabase.channel>;

    const setupSubscription = () => {
      channel = supabase
        .channel('public:incidents')
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'incidents',
            filter: 'status=eq.PENDING' 
          },
          (payload) => {
            const incident = payload.new;
            
            // Play Audio
            if (audioRef.current) {
               audioRef.current.play().catch((err) => 
                 console.error("Audio playback prevented by browser:", err)
               );
            }

            // Determine toast styling based on severity
            let toastStyle = { background: 'var(--bg-surface)', color: 'var(--text-primary)' };
            switch (incident.severity_level) {
              case 'Critical':
                toastStyle = { background: 'var(--danger)', color: 'var(--text-white)' };
                break;
              case 'High':
                toastStyle = { background: 'var(--warning-dark)', color: 'var(--text-white)' };
                break;
              case 'Medium':
                toastStyle = { background: 'var(--warning)', color: 'var(--text-primary)' };
                break;
              case 'Low':
                toastStyle = { background: 'var(--info)', color: 'var(--text-white)' };
                break;
            }
            
            toast(`🚨 New ${incident.severity_level} Incident!`, {
              style: toastStyle,
              duration: 8000,
            });
          }
        )
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Connected to incident realtime stream.');
            retryCount = 0;
          }

          if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn(`Connection lost. Retrying... (${retryCount + 1})`);
            const timeout = Math.min(1000 * Math.pow(2, retryCount), 30000);
            retryCount++;
            
            setTimeout(() => {
              if (channel) supabase.removeChannel(channel);
              setupSubscription();
            }, timeout);
          }
        });
    };

    setupSubscription();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
