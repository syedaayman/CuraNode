'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import AmbulanceTracker from '@/components/hospital/fleet/AmbulanceTracker';

interface Ambulance {
  id: string;
  number: string | number; // Added number column for display
  status: string;
  assigned_incident: string | null;
  updated_at: string;
}

export default function AmbulanceFleetPage() {
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrackingId, setSelectedTrackingId] = useState<string | null>(null);

  useEffect(() => {
    const resetExpiredAmbulances = async (ambs: Ambulance[]) => {
      const now = new Date();
      let updatedAmbs = [...ambs];

      for (const amb of ambs) {
        if (
          amb.status === 'DISPATCHED' &&
          amb.updated_at &&
          now.getTime() - new Date(amb.updated_at).getTime() > 3 * 60 * 1000
        ) {
          await supabase
            .from('ambulances')
            .update({
              status: 'AVAILABLE',
              assigned_incident: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', amb.id);
            
          const index = updatedAmbs.findIndex(a => a.id === amb.id);
          if (index !== -1) {
             updatedAmbs[index] = { ...updatedAmbs[index], status: 'AVAILABLE', assigned_incident: null };
          }
        }
      }
      return updatedAmbs;
    };

    const fetchAmbulances = async () => {
      const { data, error } = await supabase
        .from('ambulances')
        .select('*')
        .order('id', { ascending: true });
      if (data && !error) {
        const cleanedData = await resetExpiredAmbulances(data);
        setAmbulances(cleanedData);
      }
      setLoading(false);
    };
    fetchAmbulances();

    const ambulanceChannel = supabase
      .channel('ambulances-changes-fleet')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulances' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setAmbulances((current) =>
              current.map((amb) => (amb.id === payload.new.id ? (payload.new as Ambulance) : amb))
            );
          } else if (payload.eventType === 'INSERT') {
            setAmbulances((current) => [...current, payload.new as Ambulance]);
          } else if (payload.eventType === 'DELETE') {
            setAmbulances((current) => current.filter((amb) => amb.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ambulanceChannel);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col mb-8">
        <h1 className="text-[28px] md:text-[34px] font-normal tracking-[-0.02em] text-text-primary" style={{ fontFamily: 'var(--font-serif-display), serif' }}>
          Ambulance Fleet
        </h1>
        <p className="text-text-secondary font-normal text-[15px] md:text-[17px] mt-1 max-w-2xl leading-relaxed">
          Monitor and manage real-time ambulance statuses and active dispatch assignments.
        </p>
      </div>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm w-full mx-auto mt-6">
          <div className="relative">
            <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-100 opacity-75"></div>
            <div className="relative flex justify-center items-center rounded-full h-12 w-12 bg-teal-50 border-2 border-[#0D9488]">
               <span className="text-xl">🚐</span>
            </div>
          </div>
          <p className="mt-4 text-text-primary font-bold">Synchronizing Fleet...</p>
          <p className="text-text-secondary text-sm mt-1">Retrieving real-time ambulance telemetry</p>
        </div>
      ) : ambulances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center shadow-inner mb-5">
            <span className="text-3xl opacity-50">🚐</span>
          </div>
          <p className="text-text-primary font-bold text-xl">No ambulances registered</p>
          <p className="text-text-secondary font-medium mt-2 max-w-sm text-center">There are currently no ambulances provisioned in the system.</p>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ambulances.map((amb) => {
            const isAvailable = amb.status === 'AVAILABLE';
            // Fix duplicate AMB- text
            let displayId = String(amb.number || amb.id.substring(0, 4)).toUpperCase();
            if (!displayId.startsWith('AMB-')) {
              displayId = `AMB-${displayId}`;
            }
            
            return (
              <div 
                key={amb.id} 
                className="relative p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group overflow-hidden"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 ${isAvailable ? 'bg-success' : 'bg-danger'} z-20`}></div>
                
                {/* Image Area */}
                <div className="bg-cura-teal-soft -mx-6 -mt-6 mb-6 pt-8 pb-4 flex justify-center items-center border-b border-border-light relative overflow-hidden">
                  <Image 
                    src="/ambulance-asset.jpg"
                    alt="Ambulance"
                    width={220}
                    height={130}
                    className="object-contain mix-blend-multiply relative z-10 hover:scale-105 transition-transform duration-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase mb-1">Fleet Vehicle</span>
                      <h4 className="font-mono font-bold text-text-primary text-xl tracking-tight flex items-center gap-2">
                        {displayId}
                      </h4>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-bold ${
                      isAvailable 
                        ? 'bg-success-bg text-success-dark'
                        : 'bg-danger-bg text-danger-dark'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        isAvailable ? 'bg-success' : 'bg-danger animate-pulse'
                      }`}></span>
                      {amb.status.charAt(0).toUpperCase() + amb.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-5 border-t border-border-light bg-bg-soft -mx-6 -mb-6 px-6 pb-6">
                  {amb.assigned_incident ? (
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase block mb-2">Active Dispatch Assignment</span>
                      <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg border border-border-light shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-danger-bg text-danger flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-text-primary text-sm">
                            #{amb.assigned_incident.split('-')[0].toUpperCase()}
                          </span>
                          <span className="text-[10px] font-bold text-danger">En Route</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedTrackingId(amb.id)}
                        className="mt-4 w-full bg-white border border-[#B9DCD7] text-[#167C75] hover:bg-[#EAF8F5] hover:border-[#1FA99B] hover:text-[#126E68] hover:-translate-y-[1px] h-[44px] rounded-xl font-semibold text-[14px] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cura-teal focus:ring-offset-1 flex items-center justify-center gap-2 group"
                      >
                        Track Ambulance
                        <svg className="w-4 h-4 ml-1 transition-transform duration-200 group-hover:translate-x-[2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold tracking-[0.08em] text-text-secondary uppercase block mb-2">Current Status</span>
                      <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg border border-border-light shadow-sm opacity-80">
                        <div className="w-8 h-8 rounded-full bg-success-bg text-success flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-text-primary text-sm">
                            Standing By
                          </span>
                          <span className="text-[10px] font-bold text-success">Ready for Dispatch</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedTrackingId && (
        <AmbulanceTracker 
          ambulanceId={selectedTrackingId}
          incidentId={ambulances.find(a => a.id === selectedTrackingId)?.assigned_incident || ''}
          onClose={() => setSelectedTrackingId(null)}
        />
      )}
    </div>
  );
}
