import os
import math
import logging
from supabase import create_client, Client
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on the Earth
    using the Haversine formula. Returns distance in kilometers.
    """
    R = 6371.0  # Earth radius in kilometers

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c

class HospitalService:
    def __init__(self):
        self._client = None

    def _get_client(self) -> Client:
        """
        Lazily initialize the Supabase client so it gets keys after environment variables are loaded.
        """
        if self._client is not None:
            return self._client

        url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://ojnkzcohylpsxrbkjtri.supabase.co")
        key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_iFoaAmfcihLCnWEVoDle6w_Cbqk0VQz")

        if not url or not key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase credentials (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) are missing in environment."
            )

        try:
            # Create client connection
            self._client = create_client(url, key)
            return self._client
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to initialize Supabase client: {str(e)}"
            )

    async def get_ranked_hospitals(self, severity_score: int, user_lat: float = None, user_lon: float = None) -> list:
        """
        Fetch all hospitals from Supabase, calculate distances, deduplicate,
        and rank them based on the detected injury severity score (1-10) and user location.
        """
        try:
            client = self._get_client()
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Supabase client initialization failed: {str(e)}"
            )

        try:
            # Query hospitals with joined resources
            response = client.table("hospitals").select("*, hospital_resources(*)").execute()
            hospitals = response.data
            
            # Map nested hospital_resources fields back to the top-level keys for backward-compatibility
            for h in hospitals:
                resources = h.get("hospital_resources")
                if resources:
                    if isinstance(resources, list) and len(resources) > 0:
                        resources = resources[0]
                    
                    if isinstance(resources, dict):
                        h["has_icu"] = resources.get("has_icu", h.get("has_icu", False))
                        h["has_trauma_care"] = resources.get("has_trauma_care", h.get("has_trauma_care", False))
                        h["has_emergency"] = resources.get("has_emergency", h.get("has_emergency", False))
                        h["available_beds"] = resources.get("available_beds", h.get("available_beds", 0))
                        h["icu_beds"] = resources.get("icu_beds", h.get("icu_beds", 0))
                        h["has_ambulance"] = resources.get("has_ambulance", h.get("has_ambulance", False))
        except Exception as e:
            logger.warning(f"Joined hospitals-resources query failed: {e}. Falling back to hospitals query...")
            try:
                # Query the 'hospitals' table directly
                response = client.table("hospitals").select("*").execute()
                hospitals = response.data
            except Exception as e_inner:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Supabase database query failed: {str(e_inner)}"
                )

        if not hospitals:
            return []

        # 1. Deduplicate hospitals by ID and Name (case-insensitive)
        seen_ids = set()
        seen_names = set()
        unique_hospitals = []
        for h in hospitals:
            h_id = h.get("id")
            h_name = h.get("name", "").strip().lower()
            if h_id and h_id not in seen_ids and h_name not in seen_names:
                seen_ids.add(h_id)
                seen_names.add(h_name)
                unique_hospitals.append(h)

        # 2. Calculate distance and estimated travel time for each unique hospital
        # If coordinates are not provided, default to reference location
        lat = user_lat if user_lat is not None else 13.0827
        lon = user_lon if user_lon is not None else 80.2707

        for h in unique_hospitals:
            h_lat = h.get("latitude")
            h_lon = h.get("longitude")
            if h_lat is not None and h_lon is not None:
                try:
                    lat_val = float(h_lat)
                    lon_val = float(h_lon)
                    dist = calculate_distance(lat, lon, lat_val, lon_val)
                    h["distance"] = round(dist, 1)
                    # Estimate travel time assuming 1.5 minutes per km, minimum 2 minutes
                    h["estimated_travel_time"] = max(2, round(dist * 1.5))
                except (ValueError, TypeError) as ex:
                    print(f"Warning: Failed to parse coordinates for hospital {h.get('name')} (ID: {h.get('id')}): lat={h_lat}, lon={h_lon}. Error: {ex}")
                    h["distance"] = 999.0
                    h["estimated_travel_time"] = h.get("average_response_time", 15)
            else:
                h["distance"] = 999.0
                h["estimated_travel_time"] = h.get("average_response_time", 15)

        # 3. Sort unique hospitals based on severity-aware triage rules
        if severity_score >= 9:
            # CRITICAL (9-10): Prioritize ICU availability and Emergency/Trauma capability, then distance.
            # Fallback to nearest hospitals if fewer than 3 exist.
            def critical_tier(hospital):
                has_icu = bool(hospital.get("has_icu"))
                has_trauma_or_emergency = bool(hospital.get("has_trauma_care")) or bool(hospital.get("has_emergency"))
                if has_icu and has_trauma_or_emergency:
                    return 0
                elif has_icu:
                    return 1
                elif has_trauma_or_emergency:
                    return 2
                else:
                    return 3

            unique_hospitals.sort(key=lambda h: (
                critical_tier(h),
                h.get("distance", 999.0)
            ))

        elif severity_score >= 7:
            # HIGH (7-8): Recommend hospitals with ICU facilities only.
            # If fewer than 3 ICU hospitals exist, fill with nearest hospitals.
            unique_hospitals.sort(key=lambda h: (
                0 if h.get("has_icu") else 1,
                h.get("distance", 999.0)
            ))

        elif severity_score >= 4:
            # MEDIUM (4-6): Rank by distance first, then ICU availability as a tie-breaker.
            unique_hospitals.sort(key=lambda h: (
                h.get("distance", 999.0),
                0 if h.get("has_icu") else 1
            ))

        else:
            # LOW (1-3): Prioritize clinics or small hospitals (no ICU, has_icu=False), sorted by distance.
            unique_hospitals.sort(key=lambda h: (
                0 if not h.get("has_icu") else 1,
                h.get("distance", 999.0)
            ))

        # 4. Return only the Top 3 recommended facilities
        return unique_hospitals[:3]

# Export a singleton instance of the hospital service
hospital_service = HospitalService()
