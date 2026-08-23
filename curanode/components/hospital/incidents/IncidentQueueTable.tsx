'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Incident {
  id: string;
  severity_level: string;
  severity_score: number;
  latitude: number;
  longitude: number;
  status: string;
  created_at?: string;
  hospital_id?: string;
  hospital_name?: string;
}

const formatLocation = (lat: number, lng: number) => {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${latDir}, ${Math.abs(lng).toFixed(2)}° ${lngDir}`;
};

export default function IncidentQueueTable() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const { data: incidentsData, error: incidentsError } = await supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (incidentsError) {
        console.error(incidentsError);
        setError(incidentsError.message);
        return;
      }

      if (!incidentsData || incidentsData.length === 0) {
        setIncidents([]);
        return;
      }

      // Filter to show only PENDING
      const pendingIncidents = incidentsData.filter(inc => inc.status === 'PENDING');
      
      if (pendingIncidents.length === 0) {
        setIncidents([]);
        return;
      }

      // Extract hospital_id directly from incidents
      const hospitalIds = Array.from(new Set(pendingIncidents.map(inc => inc.hospital_id).filter(Boolean)));
      const hospitalMap: Record<string, string> = {};

      if (hospitalIds.length > 0) {
        // Fetch matching hospital records
        const { data: hospitalsData, error: hospitalsError } = await supabase
          .from('hospitals')
          .select('id, name')
          .in('id', hospitalIds);
        
        if (hospitalsData && !hospitalsError) {
          hospitalsData.forEach(h => {
            hospitalMap[h.id] = h.name;
          });
        }
      }

      const enrichedIncidents = pendingIncidents.map(inc => ({
        ...inc,
        hospital_name: (inc.hospital_id && hospitalMap[inc.hospital_id]) ? hospitalMap[inc.hospital_id] : 'Hospital Not Assigned'
      }));

      setIncidents(enrichedIncidents);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();

    const channel = supabase
      .channel('incidents-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'incidents',
        },
        (payload) => {
          if (payload.new.status === 'PENDING') {
            // Re-fetch to get the hospital relationship via dispatch_logs
            fetchIncidents();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'incidents',
        },
        (payload) => {
          if (payload.new.status === 'DISPATCHED') {
            // Remove the incident from the queue
            setIncidents((current) =>
              current.filter((incident) => incident.id !== payload.new.id)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dispatch_logs',
        },
        () => {
          // A new dispatch log implies an incident was fully assigned, re-fetch mapping
          fetchIncidents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAccept = async (incident: Incident) => {
    try {
      if (incident.status !== 'PENDING') {
        return;
      }
      
      setProcessingId(incident.id);
      
      const { data: availableAmbulances, error: fetchAmbulanceError } = await supabase
        .from('ambulances')
        .select('*')
        .eq('status', 'AVAILABLE')
        .limit(1);

      if (fetchAmbulanceError) throw fetchAmbulanceError;
      
      if (!availableAmbulances || availableAmbulances.length === 0) {
        alert('No available ambulances found in the fleet.');
        return;
      }

      const ambulance = availableAmbulances[0];

      const { data: ambulanceUpdate, error: updateAmbulanceError } = await supabase
        .from('ambulances')
        .update({
          status: 'DISPATCHED',
          assigned_incident: incident.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ambulance.id)
        .eq('status', 'AVAILABLE')
        .select();

      if (updateAmbulanceError) throw updateAmbulanceError;
      
      if (!ambulanceUpdate || ambulanceUpdate.length === 0) {
        alert('Ambulance was claimed by another dispatcher. Please try again.');
        return;
      }

      const dispatchedAmbulance = ambulanceUpdate[0];

      const { error: incidentError } = await supabase
        .from('incidents')
        .update({ status: 'DISPATCHED' })
        .eq('id', incident.id);

      if (incidentError) throw incidentError;

      setIncidents((current) => current.filter((i) => i.id !== incident.id));
      fetchIncidents();

      setTimeout(async () => {
        try {
          await supabase
            .from('ambulances')
            .update({
              status: 'AVAILABLE',
              assigned_incident: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', dispatchedAmbulance.id);
        } catch (resetError) {
          console.error('Failed to reset ambulance:', resetError);
        }
      }, 180000); 

    } catch (err: unknown) {
      console.error('Error in handleAccept:', err);
      if (err instanceof Error) {
        alert(err.message || 'Failed to dispatch ambulance.');
      } else {
        alert('Failed to dispatch ambulance.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-bg-surface rounded-2xl border border-border-light shadow-sm w-full mx-auto mt-6">
        <div className="relative">
          <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cura-teal-light opacity-75"></div>
          <div className="relative flex justify-center items-center rounded-full h-12 w-12 bg-cura-teal-soft border-2 border-cura-teal">
             <span className="text-xl">🚑</span>
          </div>
        </div>
        <p className="mt-4 text-text-primary font-bold">Connecting to Dispatch Grid...</p>
        <p className="text-text-secondary text-sm mt-1">Fetching real-time emergency incidents</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-danger-bg border border-danger-dark/30 rounded-2xl w-full mx-auto mt-6 shadow-sm flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0">
          <span className="text-danger font-bold text-xl">!</span>
        </div>
        <div>
          <h3 className="text-danger-dark font-extrabold text-lg mb-1">Grid Connection Failed</h3>
          <p className="text-danger font-medium text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full mx-auto mt-6">
      {/* Header Section */}
      <div className="flex flex-col mb-8">
        <h2 className="text-[28px] md:text-[34px] font-normal tracking-[-0.02em] text-text-primary" style={{ fontFamily: 'var(--font-serif-display), serif' }}>
          Active Incident Queue
        </h2>
        <p className="text-text-secondary font-normal text-[15px] md:text-[17px] mt-1 max-w-2xl leading-relaxed">
          Monitor and triage incoming emergency requests in real-time.
        </p>
      </div>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-border-light rounded-2xl shadow-sm">
          <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center shadow-inner mb-5">
            <span className="text-3xl text-success">✅</span>
          </div>
          <p className="text-text-primary font-bold text-[20px]">Queue is Clear</p>
          <p className="text-text-secondary font-medium mt-1 text-[15px] text-center">Waiting for new emergency requests.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto pb-4">
          <table className="w-full min-w-[1000px] border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-[12px] font-bold tracking-[0.07em] text-text-secondary uppercase">
                <th className="px-6 py-4">Incident ID</th>
                <th className="px-6 py-4">Severity Level</th>
                <th className="px-6 py-4">Coordinates</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents?.map((incident) => {
                const isProcessing = processingId === incident.id;
                const isCritical = incident.severity_level.toUpperCase() === 'CRITICAL' || incident.severity_score >= 8;
                
                return (
                  <tr 
                    key={incident.id}
                    className="bg-white shadow-sm hover:shadow-md transition-shadow group"
                  >
                    {/* Incident ID */}
                    <td className="px-6 py-5 border-y border-l border-border-light rounded-l-2xl group-hover:border-border-medium transition-colors">
                      <span className="text-text-primary px-3 py-1 font-mono text-[14px] font-bold">
                        #{incident.id.split('-')[0].toUpperCase()}
                      </span>
                    </td>

                    {/* Severity */}
                    <td className="px-6 py-5 border-y border-border-light group-hover:border-border-medium transition-colors">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${isCritical ? 'bg-danger-bg text-danger-dark border-danger/20' : 'bg-success-bg text-success-dark border-success/20'}`}>
                        <span className="font-bold text-[12px] uppercase tracking-wide">
                          {incident.severity_level.toLowerCase()}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-current opacity-50"></span>
                        <span className="font-semibold text-[12px]">
                          {incident.severity_score}/10
                        </span>
                      </span>
                    </td>

                    {/* Location */}
                    <td className="px-6 py-5 border-y border-border-light group-hover:border-border-medium transition-colors">
                      <span className="text-text-secondary font-medium text-[15px] flex items-center gap-2">
                        <span className="text-[14px]">📍</span>
                        {formatLocation(incident.latitude, incident.longitude)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-5 border-y border-border-light group-hover:border-border-medium transition-colors">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold ${
                        incident.status === 'PENDING' 
                          ? 'bg-warning-bg text-warning-dark'
                          : 'bg-success-bg text-success-dark'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          incident.status === 'PENDING' ? 'bg-warning animate-pulse' : 'bg-success'
                        }`}></span>
                        {incident.status}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-6 py-5 rounded-r-2xl border-y border-r border-border-light text-right group-hover:border-border-medium transition-colors">
                      <button 
                        onClick={() => handleAccept(incident)}
                        disabled={isProcessing}
                        className="inline-flex justify-center items-center px-[20px] h-[44px] text-[14px] font-semibold text-white transition-all duration-200 bg-cura-teal hover:bg-cura-teal-dark hover:-translate-y-[1px] hover:shadow-[0_6px_16px_rgba(31,169,155,0.18)] rounded-xl focus:outline-none focus:ring-2 focus:ring-cura-teal focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        {isProcessing ? (
                          <>
                            <svg className="w-4 h-4 mr-1.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Dispatching
                          </>
                        ) : (
                          <>
                            Dispatch Fleet
                            <svg className="w-4 h-4 ml-1.5 transition-transform duration-200 group-hover:translate-x-[2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
