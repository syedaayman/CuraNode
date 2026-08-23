'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function ResourceForm() {
  const [hospitalId, setHospitalId] = useState('');
  const [hasIcu, setHasIcu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch the first hospital to pre-fill the form using the real database schema
      const { data: firstHospital, error: authError } = await supabase
        .from('hospitals')
        .select('id, has_icu')
        .limit(1)
        .single();

      if (authError || !firstHospital) {
        throw new Error('No hospital records found in the database. Cannot initialize Resource Management.');
      }

      setHospitalId(firstHospital.id);
      setHasIcu(!!firstHospital.has_icu);
    } catch (err: any) {
      console.error('Error fetching resources:', err);
      setError(err.message || 'Failed to load current resources.');
      toast.error('Failed to load current resources.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedId = hospitalId.trim();
    
    if (!trimmedId) {
      toast.error('Please enter a valid Hospital ID.');
      return;
    }

    // Validate UUID format before querying
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedId)) {
      toast.error('Please enter a valid Hospital ID.');
      return;
    }

    setSaving(true);
    try {
      // First verify the hospital exists
      const { data: checkData, error: checkError } = await supabase
        .from('hospitals')
        .select('id')
        .eq('id', trimmedId)
        .maybeSingle();

      if (checkError) throw checkError;
      
      if (!checkData) {
        toast.error('Hospital not found. Please check the Hospital ID.');
        return;
      }

      // Perform the actual UPDATE according to user requirements
      const { error: updateError } = await supabase
        .from('hospitals')
        .update({
          has_icu: hasIcu,
        })
        .eq('id', trimmedId);

      if (updateError) throw updateError;
      
      toast.success('ICU availability updated successfully.');
    } catch (err: any) {
      console.error('Error updating resources:', err);
      toast.error(err.message || 'Failed to update resources.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-bg-surface rounded-2xl border border-border-light shadow-sm w-full mt-6">
        <div className="relative">
          <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cura-teal-light opacity-75"></div>
          <div className="relative flex justify-center items-center rounded-full h-12 w-12 bg-cura-teal-soft border-2 border-cura-teal">
             <span className="text-xl">🏥</span>
          </div>
        </div>
        <p className="mt-4 text-text-primary font-bold">Accessing Hospital Registry...</p>
        <p className="text-text-secondary text-sm mt-1">Retrieving resource and capacity records</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-danger-bg border border-danger-dark/30 rounded-2xl w-full mt-6 shadow-sm flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0">
          <span className="text-danger font-bold text-xl">!</span>
        </div>
        <div>
          <h3 className="text-danger-dark font-extrabold text-lg mb-1">Registry Access Failed</h3>
          <p className="text-danger font-medium text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col mb-8">
        <h2 className="text-[28px] md:text-[34px] font-normal tracking-[-0.02em] text-text-primary" style={{ fontFamily: 'var(--font-serif-display), serif' }}>
          Resource Management
        </h2>
        <p className="text-text-secondary font-normal text-[15px] md:text-[17px] mt-1 max-w-2xl leading-relaxed">
          Update facility capacities. Changes synchronize instantly with the central dispatch system.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-border-light p-8 max-w-2xl relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-bg-soft rounded-full blur-3xl pointer-events-none"></div>

      <div className="space-y-8">
        {/* Hospital ID Input */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between">
          <div className="mb-4 sm:mb-0 sm:pr-8 sm:w-1/2">
            <h3 className="font-semibold text-[#527177] text-[15px] flex items-center gap-2">
              Facility Identifier
              <span className="bg-info-bg text-info text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-bold">Required</span>
            </h3>
            <p className="text-[13px] text-text-secondary mt-1.5 leading-relaxed">Enter your facility's unique UUID to authorize capacity updates for the global network.</p>
          </div>
          <div className="w-full sm:w-1/2">
            <input 
              type="text" 
              required
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="block w-full py-2.5 px-4 bg-bg-main border border-border-light rounded-lg focus:bg-white focus:ring-2 focus:ring-cura-teal/20 focus:border-cura-teal text-sm font-mono text-text-primary shadow-sm transition-all outline-none" 
            />
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* ICU Availability */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between">
          <div className="mb-4 sm:mb-0 sm:pr-8 sm:w-1/2">
            <h3 className="font-semibold text-[#527177] text-[15px]">ICU Availability Status</h3>
            <p className="text-[13px] text-text-secondary mt-1.5 leading-relaxed">Toggle the operational status of critical care units equipped with ventilator support.</p>
          </div>
          <div className="w-full sm:w-1/2">
          <div className="w-full sm:w-1/2 flex items-center justify-start sm:justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={hasIcu}
              onClick={() => setHasIcu(!hasIcu)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cura-teal focus:ring-offset-2 ${
                hasIcu ? 'bg-cura-teal' : 'bg-border-medium'
              }`}
            >
              <span className="sr-only">Toggle ICU Availability</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  hasIcu ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`ml-3 text-sm font-medium ${hasIcu ? 'text-text-primary' : 'text-text-muted'}`}>
              {hasIcu ? 'Available' : 'Unavailable'}
            </span>
          </div>
          </div>
        </div>
      </div>
      
      <div className="pt-8 mt-8 border-t border-slate-100 flex justify-end">
        <button 
          type="submit" 
          disabled={saving}
          className="bg-cura-teal hover:bg-cura-teal-dark text-white font-semibold px-[20px] h-[44px] rounded-xl hover:-translate-y-[1px] hover:shadow-[0_6px_16px_rgba(31,169,155,0.18)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cura-teal focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto inline-flex justify-center items-center group"
        >
          {saving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Transmitting...
            </>
          ) : (
            <>
              <span>Save Capacity Updates</span>
              <svg className="w-4 h-4 ml-1.5 transition-transform duration-200 group-hover:translate-x-[2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </form>
  </div>
  );
}
