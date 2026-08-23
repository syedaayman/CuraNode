-- Redesigned Supabase Database Schema Setup

-- 1. Create Ambulance Providers Table
CREATE TABLE IF NOT EXISTS public.ambulance_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('HOSPITAL', 'GOVERNMENT', 'PRIVATE')),
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
    contact_number VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for Ambulance Providers
ALTER TABLE public.ambulance_providers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ambulance_providers' AND policyname = 'Allow public select on ambulance_providers') THEN
        CREATE POLICY "Allow public select on ambulance_providers" ON public.ambulance_providers FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ambulance_providers' AND policyname = 'Allow public insert on ambulance_providers') THEN
        CREATE POLICY "Allow public insert on ambulance_providers" ON public.ambulance_providers FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ambulance_providers' AND policyname = 'Allow public update on ambulance_providers') THEN
        CREATE POLICY "Allow public update on ambulance_providers" ON public.ambulance_providers FOR UPDATE USING (true);
    END IF;
END $$;

-- 2. Create Hospital Resources Table
CREATE TABLE IF NOT EXISTS public.hospital_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID UNIQUE REFERENCES public.hospitals(id) ON DELETE CASCADE,
    has_icu BOOLEAN DEFAULT false,
    has_trauma_care BOOLEAN DEFAULT false,
    has_emergency BOOLEAN DEFAULT false,
    available_beds INTEGER DEFAULT 0,
    icu_beds INTEGER DEFAULT 0,
    has_ambulance BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for Hospital Resources
ALTER TABLE public.hospital_resources ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hospital_resources' AND policyname = 'Allow public select on hospital_resources') THEN
        CREATE POLICY "Allow public select on hospital_resources" ON public.hospital_resources FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hospital_resources' AND policyname = 'Allow public insert on hospital_resources') THEN
        CREATE POLICY "Allow public insert on hospital_resources" ON public.hospital_resources FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hospital_resources' AND policyname = 'Allow public update on hospital_resources') THEN
        CREATE POLICY "Allow public update on hospital_resources" ON public.hospital_resources FOR UPDATE USING (true);
    END IF;
END $$;

-- 3. Add provider_id and cast assigned_hospital to UUID references on ambulances table
ALTER TABLE public.ambulances ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES public.ambulance_providers(id) ON DELETE SET NULL;

-- 4. Create Dispatches Table (replaces dispatch_logs)
CREATE TABLE IF NOT EXISTS public.dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambulance_id VARCHAR(50) REFERENCES public.ambulances(id) ON DELETE CASCADE,
    incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
    dispatch_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'COMPLETED'))
);

-- Enable RLS for Dispatches
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispatches' AND policyname = 'Allow public select on dispatches') THEN
        CREATE POLICY "Allow public select on dispatches" ON public.dispatches FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispatches' AND policyname = 'Allow public insert on dispatches') THEN
        CREATE POLICY "Allow public insert on dispatches" ON public.dispatches FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispatches' AND policyname = 'Allow public update on dispatches') THEN
        CREATE POLICY "Allow public update on dispatches" ON public.dispatches FOR UPDATE USING (true);
    END IF;
END $$;

-- 5. Seed hospital resources from existing hospitals
INSERT INTO public.hospital_resources (hospital_id, has_icu, has_trauma_care, has_emergency, available_beds, icu_beds, has_ambulance)
SELECT id, has_icu, has_trauma_care, has_emergency, available_beds, icu_beds, has_ambulance
FROM public.hospitals
ON CONFLICT (hospital_id) DO NOTHING;

-- 6. Seed default Ambulance Providers (UUID mappings matching existing hospitals)
INSERT INTO public.ambulance_providers (id, name, type, hospital_id, contact_number)
VALUES
  ('1a111111-1111-1111-1111-111111111111', 'Apollo Ambulance Provider', 'HOSPITAL', '1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66', '044-28290200'),
  ('2b222222-2222-2222-2222-222222222222', 'Fortis Ambulance Provider', 'HOSPITAL', '2b4c6d8e-0f22-4c33-9d44-be55ff66aa77', '044-42892222'),
  ('3c333333-3333-3333-3333-333333333333', 'MIOT Ambulance Provider', 'HOSPITAL', '3c5d7e9f-1a33-4d44-ae55-cf66aa77bb88', '044-42002288'),
  ('4d444444-4444-4444-4444-444444444444', 'Chennai Govt Emergency Service', 'GOVERNMENT', NULL, '108'),
  ('5e555555-5555-5555-5555-555555555555', 'Stanplus Private Ambulance', 'PRIVATE', NULL, '9876543210')
ON CONFLICT (id) DO NOTHING;

-- 7. Update ambulances with provider_id assignments
UPDATE public.ambulances SET provider_id = '1a111111-1111-1111-1111-111111111111' WHERE id = '1';
UPDATE public.ambulances SET provider_id = '4d444444-4444-4444-4444-444444444444' WHERE id = '2';
UPDATE public.ambulances SET provider_id = '2b222222-2222-2222-2222-222222222222' WHERE id = '3';

-- 8. Seed a fourth ambulance owned by private provider
INSERT INTO public.ambulances (id, number, status, latitude, longitude, speed, provider_id)
VALUES ('4', 'AMB-777', 'AVAILABLE', 13.0587, 80.2257, 40.0, '5e555555-5555-5555-5555-555555555555')
ON CONFLICT (id) DO UPDATE SET provider_id = EXCLUDED.provider_id;
