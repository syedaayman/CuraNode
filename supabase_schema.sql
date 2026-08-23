-- Schema setup for real-time ambulance dispatch system

-- 1. Create Incidents Table
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    severity_score INTEGER,
    severity_level VARCHAR(20),
    confidence DOUBLE PRECISION,
    analysis TEXT,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, DISPATCHED, COMPLETED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS & policy for public reads/writes
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on incidents" ON public.incidents FOR SELECT USING (true);
CREATE POLICY "Allow public insert on incidents" ON public.incidents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on incidents" ON public.incidents FOR UPDATE USING (true);

-- 2. Create Ambulances Table
CREATE TABLE IF NOT EXISTS public.ambulances (
    id VARCHAR(50) PRIMARY KEY,
    number VARCHAR(20) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status VARCHAR(20) DEFAULT 'AVAILABLE', -- AVAILABLE, DISPATCHED, AT_PATIENT, TRANSPORTING
    assigned_hospital VARCHAR(50), -- Reference to hospital ID
    assigned_incident UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
    speed DOUBLE PRECISION DEFAULT 40.0, -- km/h
    eta VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS & policy for public reads/writes
ALTER TABLE public.ambulances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on ambulances" ON public.ambulances FOR SELECT USING (true);
CREATE POLICY "Allow public insert on ambulances" ON public.ambulances FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on ambulances" ON public.ambulances FOR UPDATE USING (true);

-- Seed Initial Ambulances (Chennai area coordinates matching previous mock data)
INSERT INTO public.ambulances (id, number, status, latitude, longitude, speed)
VALUES
  ('1', 'AMB-204', 'AVAILABLE', 13.0947, 80.2627, 40.0),
  ('2', 'AMB-911', 'AVAILABLE', 13.0737, 80.2817, 40.0),
  ('3', 'AMB-108', 'AVAILABLE', 13.0887, 80.2757, 40.0)
ON CONFLICT (id) DO UPDATE
SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, status = EXCLUDED.status;

-- 3. Create Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambulance_id VARCHAR(50) REFERENCES public.ambulances(id) ON DELETE CASCADE,
    incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
    hospital_id VARCHAR(50),
    dispatch_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'DISPATCHED' -- DISPATCHED, COMPLETED
);

-- Enable RLS & policy for public reads/writes
ALTER TABLE public.dispatch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on dispatch_logs" ON public.dispatch_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on dispatch_logs" ON public.dispatch_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on dispatch_logs" ON public.dispatch_logs FOR UPDATE USING (true);

-- 4. Alter existing tables to add columns if they don't exist
ALTER TABLE public.incidents ALTER COLUMN status TYPE VARCHAR(50);

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS selected_hospital_id UUID;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS selected_hospital_name VARCHAR(100);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS incident_status VARCHAR(50);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS hospital_selected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.dispatch_logs ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(50) DEFAULT 'REQUESTED';
ALTER TABLE public.dispatch_logs ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.dispatch_logs ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.dispatch_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.dispatch_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. Create transaction RPC function for hospital selection
CREATE OR REPLACE FUNCTION public.request_hospital_transaction(
    p_incident_id UUID,
    p_hospital_id UUID,
    p_hospital_name VARCHAR,
    p_now TIMESTAMP WITH TIME ZONE
) RETURNS JSONB AS $$
DECLARE
    v_dispatch_log_id UUID;
    v_result JSONB;
BEGIN
    -- Update existing incident
    UPDATE public.incidents
    SET 
        selected_hospital_id = p_hospital_id,
        selected_hospital_name = p_hospital_name,
        incident_status = 'PENDING_HOSPITAL_ACCEPTANCE',
        status = 'PENDING_HOSPITAL_ACCEPTANCE',
        hospital_selected_at = p_now,
        updated_at = p_now
    WHERE id = p_incident_id;

    -- Create dispatch log request
    v_dispatch_log_id := gen_random_uuid();
    INSERT INTO public.dispatch_logs (
        id, 
        incident_id, 
        hospital_id, 
        status, 
        dispatch_status, 
        dispatch_time, 
        requested_at, 
        created_at, 
        updated_at
    )
    VALUES (
        v_dispatch_log_id, 
        p_incident_id, 
        p_hospital_id, 
        'REQUESTED', 
        'REQUESTED', 
        p_now, 
        p_now, 
        p_now, 
        p_now
    );

    v_result := jsonb_build_object(
        'success', true,
        'dispatch_log_id', v_dispatch_log_id,
        'incident_id', p_incident_id,
        'hospital_id', p_hospital_id,
        'dispatch_status', 'REQUESTED',
        'incident_status', 'PENDING_HOSPITAL_ACCEPTANCE'
    );
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

