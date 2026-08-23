import os
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
from supabase import create_client, Client
from app.services.hospital_service import hospital_service, calculate_distance

logger = logging.getLogger(__name__)

# Initial seed data for ambulance providers
INITIAL_PROVIDERS = [
    {
        "id": "1a111111-1111-1111-1111-111111111111",
        "name": "Apollo Ambulance Provider",
        "type": "HOSPITAL",
        "hospital_id": "1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66",
        "contact_number": "044-28290200"
    },
    {
        "id": "2b222222-2222-2222-2222-222222222222",
        "name": "Fortis Ambulance Provider",
        "type": "HOSPITAL",
        "hospital_id": "2b4c6d8e-0f22-4c33-9d44-be55ff66aa77",
        "contact_number": "044-42892222"
    },
    {
        "id": "3c333333-3333-3333-3333-333333333333",
        "name": "MIOT Ambulance Provider",
        "type": "HOSPITAL",
        "hospital_id": "3c5d7e9f-1a33-4d44-ae55-cf66aa77bb88",
        "contact_number": "044-42002288"
    },
    {
        "id": "4d444444-4444-4444-4444-444444444444",
        "name": "Chennai Govt Emergency Service",
        "type": "GOVERNMENT",
        "hospital_id": None,
        "contact_number": "108"
    },
    {
        "id": "5e555555-5555-5555-5555-555555555555",
        "name": "Stanplus Private Ambulance",
        "type": "PRIVATE",
        "hospital_id": None,
        "contact_number": "9876543210"
    }
]

# Initial seed data for fallback and startup database setup
INITIAL_AMBULANCES = [
    {
        "id": "1",
        "number": "AMB-204",
        "status": "AVAILABLE",
        "latitude": 13.0827 + 0.012,
        "longitude": 80.2707 - 0.008,
        "provider_id": "1a111111-1111-1111-1111-111111111111",
        "assigned_hospital": None,
        "assigned_incident": None,
        "speed": 40.0,
        "eta": None
    },
    {
        "id": "2",
        "number": "AMB-911",
        "status": "AVAILABLE",
        "latitude": 13.0827 - 0.009,
        "longitude": 80.2707 + 0.011,
        "provider_id": "4d444444-4444-4444-4444-444444444444",
        "assigned_hospital": None,
        "assigned_incident": None,
        "speed": 40.0,
        "eta": None
    },
    {
        "id": "3",
        "number": "AMB-108",
        "status": "AVAILABLE",
        "latitude": 13.0827 + 0.006,
        "longitude": 80.2707 + 0.005,
        "provider_id": "2b222222-2222-2222-2222-222222222222",
        "assigned_hospital": None,
        "assigned_incident": None,
        "speed": 40.0,
        "eta": None
    },
    {
        "id": "4",
        "number": "AMB-777",
        "status": "AVAILABLE",
        "latitude": 13.0827 - 0.004,
        "longitude": 80.2707 - 0.005,
        "provider_id": "5e555555-5555-5555-5555-555555555555",
        "assigned_hospital": None,
        "assigned_incident": None,
        "speed": 40.0,
        "eta": None
    }
]

class AmbulanceService:
    def __init__(self):
        self._client = None
        self._has_tables = None
        self._table_existence_cache: Dict[str, bool] = {}
        
        # Initialize internal in-memory database registries / fallbacks
        self.providers: Dict[str, dict] = {prov["id"]: prov.copy() for prov in INITIAL_PROVIDERS}
        self.ambulances: Dict[str, dict] = {amb["id"]: amb.copy() for amb in INITIAL_AMBULANCES}
        self.incidents: Dict[str, dict] = {}
        self.dispatches: Dict[str, dict] = {}
        
        # Backward-compatibility fallback
        self.dispatch_logs: List[dict] = []

    def _get_client(self) -> Optional[Client]:
        try:
            return hospital_service._get_client()
        except Exception:
            return None

    def check_db_tables(self) -> bool:
        """
        Backward compatibility check mapping to the ambulances table.
        """
        return self.check_table_exists("ambulances")

    def check_table_exists(self, table_name: str) -> bool:
        """
        Verify if a specific table exists in Supabase. Results are cached.
        """
        if table_name in self._table_existence_cache:
            return self._table_existence_cache[table_name]

        client = self._get_client()
        if not client:
            self._table_existence_cache[table_name] = False
            return False

        try:
            # Query one row to check database table accessibility
            client.table(table_name).select("*").limit(1).execute()
            self._table_existence_cache[table_name] = True
            logger.info(f"Supabase database table '{table_name}' verified. Persistence active.")
        except Exception as e:
            logger.warning(
                f"Supabase table '{table_name}' not found or inaccessible. Using in-memory fallback. "
                f"Ensure migrations are applied. Error: {e}"
            )
            self._table_existence_cache[table_name] = False

        return self._table_existence_cache[table_name]

    async def initialize_ambulances(self):
        """
        Synchronizes providers and ambulances from Supabase or inserts initial records.
        """
        # 1. Initialize Ambulance Providers
        if self.check_table_exists("ambulance_providers"):
            try:
                client = self._get_client()
                response = client.table("ambulance_providers").select("*").execute()
                if response.data and len(response.data) > 0:
                    self.providers = {p["id"]: p.copy() for p in response.data}
                    logger.info("Synced ambulance providers from database.")
                else:
                    logger.info("Supabase provider registry empty. Seeding default providers...")
                    for prov in INITIAL_PROVIDERS:
                        client.table("ambulance_providers").insert(prov).execute()
            except Exception as e:
                logger.error(f"Failed to initialize ambulance providers in DB: {e}")

        # 2. Initialize Ambulances
        if self.check_table_exists("ambulances"):
            try:
                client = self._get_client()
                response = client.table("ambulances").select("*").execute()
                if response.data and len(response.data) > 0:
                    for amb in response.data:
                        self.ambulances[amb["id"]] = {
                            "id": amb["id"],
                            "number": amb["number"],
                            "status": amb["status"].upper(),
                            "latitude": float(amb["latitude"]),
                            "longitude": float(amb["longitude"]),
                            "provider_id": amb.get("provider_id") or self.ambulances.get(amb["id"], {}).get("provider_id"),
                            "assigned_hospital": amb.get("assigned_hospital"),
                            "assigned_incident": amb.get("assigned_incident"),
                            "speed": float(amb.get("speed", 40.0)),
                            "eta": amb.get("eta")
                        }
                    logger.info("Synced ambulance settings from database cache.")
                else:
                    logger.info("Supabase ambulance registry empty. Seeding default vehicles...")
                    for amb in INITIAL_AMBULANCES:
                        client.table("ambulances").insert(amb).execute()
            except Exception as e:
                logger.error(f"Failed to synchronize database state: {e}")

    async def get_all_providers(self) -> List[dict]:
        """
        Fetches all ambulance provider listings.
        """
        if self.check_table_exists("ambulance_providers"):
            try:
                client = self._get_client()
                response = client.table("ambulance_providers").select("*").execute()
                if response.data:
                    self.providers = {p["id"]: p.copy() for p in response.data}
                    return response.data
            except Exception as e:
                logger.warning(f"Error querying providers database. Returning cache: {e}")
        return list(self.providers.values())

    async def get_provider(self, provider_id: str) -> Optional[dict]:
        """
        Retrieves a single ambulance provider profile.
        """
        if self.check_table_exists("ambulance_providers"):
            try:
                client = self._get_client()
                response = client.table("ambulance_providers").select("*").eq("id", provider_id).execute()
                if response.data:
                    return response.data[0]
            except Exception as e:
                logger.warning(f"Error retrieving provider {provider_id} from DB: {e}")
        return self.providers.get(provider_id)

    async def get_all_ambulances(self) -> List[dict]:
        """
        Fetches all ambulance positions and statuses.
        """
        if self.check_table_exists("ambulances"):
            try:
                client = self._get_client()
                response = client.table("ambulances").select("*").execute()
                if response.data:
                    for amb in response.data:
                        self.ambulances[amb["id"]] = {
                            "id": amb["id"],
                            "number": amb["number"],
                            "status": amb["status"].upper(),
                            "latitude": float(amb["latitude"]),
                            "longitude": float(amb["longitude"]),
                            "provider_id": amb.get("provider_id") or self.ambulances.get(amb["id"], {}).get("provider_id"),
                            "assigned_hospital": amb.get("assigned_hospital"),
                            "assigned_incident": amb.get("assigned_incident"),
                            "speed": float(amb.get("speed", 40.0)),
                            "eta": amb.get("eta")
                        }
                    return list(self.ambulances.values())
            except Exception as e:
                logger.warning(f"Error querying ambulances database. Returning cache: {e}")
        return list(self.ambulances.values())

    async def get_ambulance(self, amb_id: str) -> Optional[dict]:
        """
        Returns a single ambulance model.
        """
        if self.check_table_exists("ambulances"):
            try:
                client = self._get_client()
                response = client.table("ambulances").select("*").eq("id", amb_id).execute()
                if response.data:
                    db_amb = response.data[0]
                    if "provider_id" not in db_amb or db_amb["provider_id"] is None:
                        db_amb["provider_id"] = self.ambulances.get(amb_id, {}).get("provider_id")
                    return db_amb
            except Exception as e:
                logger.warning(f"Error retrieving database details for ambulance {amb_id}: {e}")
        return self.ambulances.get(amb_id)

    async def update_ambulance(self, amb_id: str, updates: Dict[str, Any]) -> Optional[dict]:
        """
        Applies updates to ambulance (e.g. status changes, coordinate updates) in memory and database.
        """
        if amb_id not in self.ambulances:
            return None

        # Clean status inputs (uppercase)
        if "status" in updates:
            updates["status"] = updates["status"].upper()

        # Update cache registry
        for key, val in updates.items():
            self.ambulances[amb_id][key] = val

        if self.check_table_exists("ambulances"):
            try:
                client = self._get_client()
                client.table("ambulances").update(updates).eq("id", amb_id).execute()
            except Exception as e:
                logger.warning(f"Database write failed for ambulance {amb_id} update: {e}")

        return self.ambulances[amb_id]

    async def find_nearest_available_ambulance(self, target_lat: float, target_lon: float) -> Optional[dict]:
        """
        Returns closest AVAILABLE ambulance coordinates using the Haversine formula (fallback logic).
        """
        all_ambs = await self.get_all_ambulances()
        available_vehicles = [a for a in all_ambs if a["status"].upper() == "AVAILABLE"]

        if not available_vehicles:
            return None

        nearest = None
        min_distance = float("inf")

        for amb in available_vehicles:
            dist = calculate_distance(
                float(amb["latitude"]), float(amb["longitude"]),
                target_lat, target_lon
            )
            if dist < min_distance:
                min_distance = dist
                nearest = amb

        return nearest

    async def save_incident(self, incident: dict) -> dict:
        """
        Persists a new patient incident record.
        """
        inc_id = incident["id"]
        self.incidents[inc_id] = incident.copy()

        if self.check_table_exists("incidents"):
            try:
                client = self._get_client()
                client.table("incidents").insert(incident).execute()
            except Exception as e:
                logger.warning(f"Database insert failed for incident record {inc_id}: {e}")

        return incident

    async def get_incident(self, incident_id: str) -> Optional[dict]:
        """
        Fetches incident specifications.
        """
        if self.check_table_exists("incidents"):
            try:
                client = self._get_client()
                response = client.table("incidents").select("*").eq("id", incident_id).execute()
                if response.data:
                    return response.data[0]
            except Exception as e:
                logger.warning(f"Database select failed for incident {incident_id}: {e}")
        return self.incidents.get(incident_id)

    async def update_incident(self, incident_id: str, updates: Dict[str, Any]) -> Optional[dict]:
        """
        Modifies incident parameters (e.g. status changes).
        """
        if incident_id in self.incidents:
            for key, val in updates.items():
                self.incidents[incident_id][key] = val

        if self.check_table_exists("incidents"):
            try:
                client = self._get_client()
                # Filter updates for valid Supabase schema columns
                db_updates = {k: v for k, v in updates.items() if k in ("status", "latitude", "longitude", "severity_score", "severity_level", "analysis")}
                if db_updates:
                    client.table("incidents").update(db_updates).eq("id", incident_id).execute()
            except Exception as e:
                logger.warning(f"Database update failed for incident {incident_id}: {e}")

        return self.incidents.get(incident_id)

    async def save_dispatch(self, dispatch: dict) -> dict:
        """
        Saves a new dispatch log record to the database or fallback list.
        """
        disp_id = dispatch["id"]
        self.dispatches[disp_id] = dispatch.copy()
        
        # Maintain backward compatibility list
        self.dispatch_logs.append(dispatch)

        if self.check_table_exists("dispatches"):
            try:
                client = self._get_client()
                client.table("dispatches").insert(dispatch).execute()
            except Exception as e:
                logger.warning(f"Database insert failed for dispatch {disp_id} in dispatches: {e}")
        elif self.check_table_exists("dispatch_logs"):
            try:
                client = self._get_client()
                db_payload = {k: v for k, v in dispatch.items() if k in ("id", "incident_id", "hospital_id", "status", "dispatch_time", "completed_time")}
                client.table("dispatch_logs").insert(db_payload).execute()
            except Exception as e:
                logger.warning(f"Database insert failed for dispatch {disp_id} in dispatch_logs: {e}")

        return dispatch

    async def get_dispatch(self, dispatch_id: str) -> Optional[dict]:
        """
        Retrieves a single dispatch model.
        """
        if self.check_table_exists("dispatches"):
            try:
                client = self._get_client()
                response = client.table("dispatches").select("*").eq("id", dispatch_id).execute()
                if response.data:
                    return response.data[0]
            except Exception as e:
                logger.warning(f"Database select failed for dispatch {dispatch_id}: {e}")
        return self.dispatches.get(dispatch_id)

    async def update_dispatch(self, dispatch_id: str, updates: Dict[str, Any]) -> Optional[dict]:
        """
        Updates dispatch status/completed_time in memory and database.
        """
        if dispatch_id in self.dispatches:
            for key, val in updates.items():
                self.dispatches[dispatch_id][key] = val
        
        # Update backward compatibility log list items
        for log in self.dispatch_logs:
            if log.get("id") == dispatch_id:
                for key, val in updates.items():
                    log[key] = val

        if self.check_table_exists("dispatches"):
            try:
                client = self._get_client()
                client.table("dispatches").update(updates).eq("id", dispatch_id).execute()
            except Exception as e:
                logger.warning(f"Database update failed for dispatch {dispatch_id} in dispatches: {e}")
        elif self.check_table_exists("dispatch_logs"):
            try:
                client = self._get_client()
                db_updates = {k: v for k, v in updates.items() if k in ("status", "hospital_id", "dispatch_time", "completed_time")}
                if "dispatch_status" in updates and "status" not in db_updates:
                    db_updates["status"] = updates["dispatch_status"]
                if db_updates:
                    client.table("dispatch_logs").update(db_updates).eq("id", dispatch_id).execute()
            except Exception as e:
                logger.warning(f"Database update failed for dispatch log {dispatch_id} in dispatch_logs: {e}")

        return self.dispatches.get(dispatch_id)


    async def save_dispatch_log(self, log: dict) -> dict:
        """
        Backward compatibility log saver redirection.
        """
        return await self.save_dispatch(log)

    async def request_hospital(self, incident_id: str, hospital_id: str, hospital_name: str) -> dict:
        """
        Atomically updates the incident and creates a dispatch log request.
        Uses database transaction RPC if available, with robust sequential fallback.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        
        # 1. Update in-memory fallback cache
        if incident_id in self.incidents:
            self.incidents[incident_id].update({
                "selected_hospital_id": hospital_id,
                "selected_hospital_name": hospital_name,
                "incident_status": "PENDING_HOSPITAL_ACCEPTANCE",
                "status": "PENDING_HOSPITAL_ACCEPTANCE",
                "hospital_selected_at": now_str,
                "updated_at": now_str
            })
        
        dispatch_log_id = str(uuid.uuid4())
        dispatch_req = {
            "id": dispatch_log_id,
            "incident_id": incident_id,
            "hospital_id": hospital_id,
            "status": "REQUESTED",
            "dispatch_status": "REQUESTED",
            "dispatch_time": now_str,
            "requested_at": now_str,
            "created_at": now_str,
            "updated_at": now_str
        }
        self.dispatches[dispatch_log_id] = dispatch_req.copy()
        self.dispatch_logs.append(dispatch_req)

        # 2. Persist to database (try RPC transaction first, then fallback to sequential)
        client = self._get_client()
        if client:
            try:
                # Call PostgreSQL transaction function RPC
                res = client.rpc("request_hospital_transaction", {
                    "p_incident_id": incident_id,
                    "p_hospital_id": hospital_id,
                    "p_hospital_name": hospital_name,
                    "p_now": now_str
                }).execute()
                if res.data:
                    logger.info(f"Successfully requested hospital {hospital_id} via RPC transaction for Incident {incident_id}")
                    if isinstance(res.data, dict):
                        return res.data
            except Exception as rpc_err:
                logger.warning(f"RPC transaction failed, falling back to sequential database queries: {rpc_err}")
                
                # Sequential Fallback:
                # Update incident
                try:
                    client.table("incidents").update({
                        "selected_hospital_id": hospital_id,
                        "selected_hospital_name": hospital_name,
                        "incident_status": "PENDING_HOSPITAL_ACCEPTANCE",
                        "status": "PENDING_HOSPITAL_ACCEPTANCE",
                        "hospital_selected_at": now_str,
                        "updated_at": now_str
                    }).eq("id", incident_id).execute()
                except Exception as inc_err:
                    logger.error(f"Fallback update incident failed: {inc_err}")

                # Insert dispatch log
                try:
                    client.table("dispatch_logs").insert({
                        "id": dispatch_log_id,
                        "incident_id": incident_id,
                        "hospital_id": hospital_id,
                        "status": "REQUESTED",
                        "dispatch_status": "REQUESTED",
                        "dispatch_time": now_str,
                        "requested_at": now_str,
                        "created_at": now_str,
                        "updated_at": now_str
                    }).execute()
                except Exception as log_err:
                    logger.error(f"Fallback insert dispatch_logs failed: {log_err}")
        
        return {
            "success": True,
            "dispatch_log_id": dispatch_log_id,
            "incident_id": incident_id,
            "hospital_id": hospital_id,
            "dispatch_status": "REQUESTED",
            "incident_status": "PENDING_HOSPITAL_ACCEPTANCE"
        }

# Global singleton service instance
ambulance_service = AmbulanceService()
