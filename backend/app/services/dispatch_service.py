import logging
import os
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict
from fastapi import HTTPException, status
from app.services.ambulance_service import ambulance_service
from app.services.movement_simulator import movement_simulator, fetch_osrm_route
from app.services.websocket_manager import websocket_manager
from app.services.hospital_service import hospital_service
from app.services.hospital_service import calculate_distance

logger = logging.getLogger(__name__)

# Escalation timeout in seconds (default 300 = 5 minutes, configurable via environment variable)
ESCALATION_TIMEOUT_SECONDS = int(os.getenv("ESCALATION_TIMEOUT_SECONDS", "300"))

# Fallback hospitals list matching standard seed in case Supabase is empty/offline
FALLBACK_HOSPITALS = [
    {
        "id": "1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66",
        "name": "Apollo Emergency Center",
        "latitude": 13.0604,
        "longitude": 80.2496,
        "address": "Greams Road",
        "city": "Chennai"
    },
    {
        "id": "2b4c6d8e-0f22-4c33-9d44-be55ff66aa77",
        "name": "Fortis Malar Hospital",
        "latitude": 13.0125,
        "longitude": 80.2564,
        "address": "Adyar",
        "city": "Chennai"
    },
    {
        "id": "3c5d7e9f-1a33-4d44-ae55-cf66aa77bb88",
        "name": "MIOT International",
        "latitude": 13.0232,
        "longitude": 80.1872,
        "address": "Manapakkam",
        "city": "Chennai"
    }
]

class DispatchService:
    def __init__(self):
        # Track active escalation monitor tasks keyed by incident_id
        self._escalation_tasks: Dict[str, asyncio.Task] = {}
        # Track the ordered list of candidate hospital IDs per incident
        self._escalation_candidates: Dict[str, list] = {}
        # Track the current escalation index per incident (0-based)
        self._escalation_index: Dict[str, int] = {}

    # ===================================================================
    # ESCALATION MONITOR
    # ===================================================================

    def start_escalation_monitor(self, incident_id: str, hospital_id: str, dispatch_log_id: str, candidate_hospitals: list = None):
        """
        Start a background asyncio task that waits ESCALATION_TIMEOUT_SECONDS.
        If the dispatch_log is still REQUESTED after the timeout, escalate to the next hospital.
        
        candidate_hospitals: ordered list of hospital dicts (top 3 ranked).
        """
        # Cancel any existing monitor for this incident
        self.cancel_escalation_monitor(incident_id)

        # Store the candidate hospital list and find the current index
        if candidate_hospitals:
            self._escalation_candidates[incident_id] = candidate_hospitals
            # Find the index of the current hospital in the list
            current_idx = 0
            for i, h in enumerate(candidate_hospitals):
                if h.get("id") == hospital_id:
                    current_idx = i
                    break
            self._escalation_index[incident_id] = current_idx
        elif incident_id not in self._escalation_candidates:
            # No candidates provided and none stored — cannot escalate
            logger.warning(f"No candidate hospitals available for escalation monitor on incident {incident_id}")
            return

        logger.info(
            f"[ESCALATION] Starting monitor for incident={incident_id}, hospital={hospital_id}, "
            f"log={dispatch_log_id}, timeout={ESCALATION_TIMEOUT_SECONDS}s, "
            f"index={self._escalation_index.get(incident_id, 0)}"
        )

        task = asyncio.create_task(
            self._escalation_monitor_loop(incident_id, dispatch_log_id)
        )
        self._escalation_tasks[incident_id] = task

    def cancel_escalation_monitor(self, incident_id: str):
        """Cancel the active escalation monitor for an incident (e.g. when hospital accepts)."""
        task = self._escalation_tasks.pop(incident_id, None)
        if task and not task.done():
            task.cancel()
            logger.info(f"[ESCALATION] Cancelled monitor for incident={incident_id}")

    async def _escalation_monitor_loop(self, incident_id: str, dispatch_log_id: str):
        """Background coroutine: sleep for timeout, then check and escalate if needed."""
        try:
            await asyncio.sleep(ESCALATION_TIMEOUT_SECONDS)

            # Check if the dispatch log is still REQUESTED
            log = await ambulance_service.get_dispatch(dispatch_log_id)
            if not log:
                logger.warning(f"[ESCALATION] Dispatch log {dispatch_log_id} not found. Aborting escalation.")
                return

            log_status = (log.get("dispatch_status") or log.get("status") or "").upper()
            if log_status != "REQUESTED":
                logger.info(f"[ESCALATION] Dispatch log {dispatch_log_id} status is '{log_status}', not REQUESTED. No escalation needed.")
                return

            # The hospital did NOT respond in time — escalate
            await self._escalate_to_next_hospital(incident_id, dispatch_log_id)

        except asyncio.CancelledError:
            logger.info(f"[ESCALATION] Monitor cancelled for incident={incident_id}")
        except Exception as e:
            logger.error(f"[ESCALATION] Monitor error for incident={incident_id}: {e}", exc_info=True)
        finally:
            self._escalation_tasks.pop(incident_id, None)

    async def _escalate_to_next_hospital(self, incident_id: str, expired_log_id: str):
        """Mark the current dispatch log as EXPIRED and forward to the next hospital in the ranked list."""
        now_str = datetime.now(timezone.utc).isoformat()

        # 1. Mark the expired dispatch log
        await ambulance_service.update_dispatch(expired_log_id, {
            "dispatch_status": "EXPIRED",
            "status": "EXPIRED",
            "updated_at": now_str
        })

        # 2. Get the expired log to find the previous hospital
        expired_log = await ambulance_service.get_dispatch(expired_log_id)
        prev_hospital_id = expired_log.get("hospital_id") if expired_log else None

        # 3. Find the next hospital candidate
        candidates = self._escalation_candidates.get(incident_id, [])
        current_idx = self._escalation_index.get(incident_id, 0)
        next_idx = current_idx + 1

        if next_idx >= len(candidates):
            # All hospitals exhausted
            logger.warning(f"[ESCALATION] All {len(candidates)} hospitals exhausted for incident={incident_id}.")
            await ambulance_service.update_incident(incident_id, {
                "incident_status": "ESCALATION_FAILED",
                "status": "ESCALATION_FAILED",
                "updated_at": now_str
            })
            # Get previous hospital name for the message
            prev_hospital_name = "Unknown"
            if prev_hospital_id:
                prev_details = await self.get_hospital_details(prev_hospital_id)
                prev_hospital_name = prev_details.get("name", "Unknown")
            
            await websocket_manager.broadcast({
                "type": "escalation_failed",
                "incident_id": incident_id,
                "message": "No nearby hospitals accepted the request. Please try again or contact emergency services.",
                "prev_hospital_name": prev_hospital_name
            })
            # Cleanup
            self._escalation_candidates.pop(incident_id, None)
            self._escalation_index.pop(incident_id, None)
            return

        next_hospital = candidates[next_idx]
        next_hospital_id = next_hospital["id"]
        next_hospital_name = next_hospital.get("name", "Recommended Care Center")

        # Get previous hospital name
        prev_hospital_name = "Unknown"
        if prev_hospital_id:
            prev_details = await self.get_hospital_details(prev_hospital_id)
            prev_hospital_name = prev_details.get("name", "Unknown")

        logger.info(
            f"[ESCALATION] Escalating incident={incident_id} from hospital #{current_idx+1} "
            f"({prev_hospital_name}) to #{next_idx+1} ({next_hospital_name})"
        )

        # 4. Update the incident to point to the new hospital
        await ambulance_service.update_incident(incident_id, {
            "selected_hospital_id": next_hospital_id,
            "selected_hospital_name": next_hospital_name,
            "incident_status": "PENDING_HOSPITAL_ACCEPTANCE",
            "status": "PENDING_HOSPITAL_ACCEPTANCE",
            "updated_at": now_str
        })

        # 5. Create a new dispatch log for the next hospital
        new_log_id = str(uuid.uuid4())
        new_dispatch = {
            "id": new_log_id,
            "incident_id": incident_id,
            "hospital_id": next_hospital_id,
            "status": "REQUESTED",
            "dispatch_status": "REQUESTED",
            "dispatch_time": now_str,
            "requested_at": now_str,
            "updated_at": now_str
        }


        # Save to in-memory cache
        ambulance_service.dispatches[new_log_id] = new_dispatch.copy()
        ambulance_service.dispatch_logs.append(new_dispatch)

        # Persist to database (strip non-existent table columns for clean Supabase write)
        client = ambulance_service._get_client()
        if client:
            try:
                db_payload = {
                    "id": new_log_id,
                    "incident_id": incident_id,
                    "hospital_id": next_hospital_id,
                    "status": "REQUESTED"
                }
                client.table("dispatch_logs").insert(db_payload).execute()
                logger.info(f"[ESCALATION] Successfully inserted dispatch log {new_log_id} to Supabase.")
            except Exception as e:
                logger.error(f"[ESCALATION] Failed to insert new dispatch log: {e}")



        # 6. Broadcast escalation event to patient tracking via WebSocket
        await websocket_manager.broadcast({
            "type": "hospital_escalated",
            "incident_id": incident_id,
            "prev_hospital_id": prev_hospital_id,
            "prev_hospital_name": prev_hospital_name,
            "new_hospital_id": next_hospital_id,
            "new_hospital_name": next_hospital_name,
            "new_dispatch_log_id": new_log_id,
            "dispatch_status": "REQUESTED",
            "escalation_index": next_idx,
            "total_candidates": len(candidates),
            "timestamp": now_str
        })

        # Also broadcast to hospital dashboard so the new hospital receives the request
        incident = await ambulance_service.get_incident(incident_id)
        severity = incident.get("severity_level", "Medium") if incident else "Medium"
        patient_location = {
            "latitude": float(incident.get("latitude")) if incident and incident.get("latitude") is not None else 0.0,
            "longitude": float(incident.get("longitude")) if incident and incident.get("longitude") is not None else 0.0
        }
        ai_summary = incident.get("analysis", "") if incident else ""

        await websocket_manager.broadcast({
            "type": "hospital_request_created",
            "incident_id": incident_id,
            "hospital_id": next_hospital_id,
            "dispatch_log_id": new_log_id,
            "severity": severity,
            "patient_location": patient_location,
            "ai_summary": ai_summary,
            "timestamp": now_str,
            "dispatch_status": "REQUESTED",
            "incident_status": "PENDING_HOSPITAL_ACCEPTANCE"
        })

        # 7. Update the escalation index and start a new monitor for the next hospital
        self._escalation_index[incident_id] = next_idx
        self.start_escalation_monitor(incident_id, next_hospital_id, new_log_id)

    async def resume_active_monitors(self):
        """
        Called on startup. Scans the database for dispatch_logs with status REQUESTED,
        computes remaining timeout, and schedules background monitors.
        """
        client = ambulance_service._get_client()
        if not client:
            logger.warning("[ESCALATION] No Supabase client available for startup monitor recovery.")
            return

        try:
            res = client.table("dispatch_logs").select("*").eq("status", "REQUESTED").execute()
            if not res.data:
                logger.info("[ESCALATION] No active REQUESTED dispatch logs found on startup.")
                return

            for log in res.data:
                incident_id = log.get("incident_id")
                hospital_id = log.get("hospital_id")
                log_id = log.get("id")
                requested_at = log.get("requested_at") or log.get("dispatch_time") or log.get("created_at")

                if not incident_id or not log_id:
                    continue

                # Calculate remaining timeout
                remaining = ESCALATION_TIMEOUT_SECONDS
                if requested_at:
                    try:
                        request_time = datetime.fromisoformat(requested_at.replace("Z", "+00:00"))
                        elapsed = (datetime.now(timezone.utc) - request_time).total_seconds()
                        remaining = max(1, ESCALATION_TIMEOUT_SECONDS - elapsed)
                    except Exception:
                        pass

                # Fetch the incident to get severity and coordinates for ranking
                incident = await ambulance_service.get_incident(incident_id)
                if incident:
                    severity = incident.get("severity_score", 5)
                    lat = float(incident.get("latitude", 0))
                    lon = float(incident.get("longitude", 0))
                    try:
                        candidates = await hospital_service.get_ranked_hospitals(severity, lat, lon)
                    except Exception:
                        candidates = FALLBACK_HOSPITALS[:]

                    self._escalation_candidates[incident_id] = candidates

                    # Determine current index
                    current_idx = 0
                    for i, h in enumerate(candidates):
                        if h.get("id") == hospital_id:
                            current_idx = i
                            break
                    self._escalation_index[incident_id] = current_idx
                else:
                    self._escalation_candidates[incident_id] = FALLBACK_HOSPITALS[:]
                    self._escalation_index[incident_id] = 0

                logger.info(
                    f"[ESCALATION] Resuming monitor for incident={incident_id}, log={log_id}, "
                    f"remaining={remaining:.0f}s"
                )

                # Create a modified sleep task with the remaining time
                async def _resume_monitor(iid, lid, wait_time):
                    try:
                        await asyncio.sleep(wait_time)
                        log = await ambulance_service.get_dispatch(lid)
                        if log and (log.get("dispatch_status") or log.get("status") or "").upper() == "REQUESTED":
                            await self._escalate_to_next_hospital(iid, lid)
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.error(f"[ESCALATION] Resume monitor error: {e}", exc_info=True)
                    finally:
                        self._escalation_tasks.pop(iid, None)

                task = asyncio.create_task(_resume_monitor(incident_id, log_id, remaining))
                self._escalation_tasks[incident_id] = task

        except Exception as e:
            logger.error(f"[ESCALATION] Failed to resume active monitors on startup: {e}", exc_info=True)

    # ===================================================================
    # EXISTING METHODS
    # ===================================================================

    async def get_hospital_details(self, hospital_id: str) -> dict:
        """
        Retrieve hospital coordinates from Supabase or use local fallback list.
        """
        client = hospital_service._get_client()
        if client:
            try:
                res = client.table("hospitals").select("*").eq("id", hospital_id).execute()
                if res.data and len(res.data) > 0:
                    return res.data[0]
            except Exception as e:
                logger.warning(f"Failed to fetch hospital details from Supabase: {e}. Checking cache...")

        # Check local fallbacks
        for h in FALLBACK_HOSPITALS:
            if h["id"] == hospital_id:
                return h

        # Query all hospitals via public service and scan
        try:
            hospitals = await hospital_service.get_ranked_hospitals(5)
            for h in hospitals:
                if h.get("id") == hospital_id:
                    return h
        except Exception:
            pass

        # Final extreme fallback: default coordinates
        return {
            "id": hospital_id,
            "name": "Recommended Care Center",
            "latitude": 13.0827,
            "longitude": 80.2707
        }

    async def dispatch_ambulance(self, incident_id: str, hospital_id: str, dispatch_log_id: Optional[str] = None) -> dict:
        """
        Coordinates the lookup of patient and hospital coordinates, selects the best available ambulance
        according to the preferred triage criteria, saves the dispatch transaction with rollback handling,
        and broadcasts status events to socket listeners.
        
        Triage Criteria:
        1. Prefer an available ambulance owned by the target hospital (HOSPITAL provider).
        2. If unavailable, select the nearest available government or private provider ambulance.
        """
        # Cancel escalation monitor since hospital accepted
        self.cancel_escalation_monitor(incident_id)

        logger.info(f"Incoming dispatch request: Incident={incident_id}, Hospital={hospital_id}")


        # 1. Fetch incident coordinates
        incident = await ambulance_service.get_incident(incident_id)
        if not incident:
            logger.warning(f"Incident {incident_id} not found. Creating fallback pending incident.")
            patient_lat = 13.0827
            patient_lon = 80.2707
            incident_data = {
                "id": incident_id,
                "latitude": patient_lat,
                "longitude": patient_lon,
                "severity_score": 5,
                "severity_level": "Medium",
                "status": "PENDING"
            }
            await ambulance_service.save_incident(incident_data)
        else:
            patient_lat = float(incident["latitude"])
            patient_lon = float(incident["longitude"])

        print(f"DEBUG: Coordinates used for routing -> Latitude: {patient_lat}, Longitude: {patient_lon}")

        # 2. Fetch hospital coordinates
        hospital = await self.get_hospital_details(hospital_id)
        hospital_lat = float(hospital["latitude"])
        hospital_lon = float(hospital["longitude"])

        # 3. Search and select suitable available ambulance
        all_ambulances = await ambulance_service.get_all_ambulances()
        available_ambulances = [a for a in all_ambulances if a["status"].upper() == "AVAILABLE"]
        
        if not available_ambulances:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="All ambulances are currently busy. Please wait for an available vehicle."
            )

        providers = await ambulance_service.get_all_providers()
        providers_map = {p["id"]: p for p in providers}
        
        # Step A: Prefer hospital-owned ambulance belonging to the target hospital
        hospital_owned_candidates = []
        for amb in available_ambulances:
            prov_id = amb.get("provider_id")
            if prov_id and prov_id in providers_map:
                prov = providers_map[prov_id]
                if prov.get("type") == "HOSPITAL" and prov.get("hospital_id") == hospital_id:
                    hospital_owned_candidates.append(amb)
        
        selected_ambulance = None
        if hospital_owned_candidates:
            # Pick nearest hospital owned ambulance
            min_dist = float("inf")
            for amb in hospital_owned_candidates:
                dist = calculate_distance(
                    float(amb["latitude"]), float(amb["longitude"]),
                    patient_lat, patient_lon
                )
                if dist < min_dist:
                    min_dist = dist
                    selected_ambulance = amb
            logger.info(f"Selected hospital-owned ambulance {selected_ambulance['number']} (ID: {selected_ambulance['id']})")
        else:
            # Step B: Fall back to nearest government or private provider ambulance
            other_candidates = []
            for amb in available_ambulances:
                prov_id = amb.get("provider_id")
                if prov_id and prov_id in providers_map:
                    prov = providers_map[prov_id]
                    if prov.get("type") in ("GOVERNMENT", "PRIVATE"):
                        other_candidates.append(amb)
                else:
                    # Treat provider-less ambulances as fallback options
                    other_candidates.append(amb)
            
            if other_candidates:
                min_dist = float("inf")
                for amb in other_candidates:
                    dist = calculate_distance(
                        float(amb["latitude"]), float(amb["longitude"]),
                        patient_lat, patient_lon
                    )
                    if dist < min_dist:
                        min_dist = dist
                        selected_ambulance = amb
                logger.info(f"Hospital ambulance busy. Selected fallback provider ambulance {selected_ambulance['number']} (ID: {selected_ambulance['id']})")

        # If no candidates matched the provider filters, fall back to any available ambulance
        if not selected_ambulance:
            min_dist = float("inf")
            for amb in available_ambulances:
                dist = calculate_distance(
                    float(amb["latitude"]), float(amb["longitude"]),
                    patient_lat, patient_lon
                )
                if dist < min_dist:
                    min_dist = dist
                    selected_ambulance = amb
            logger.info(f"Direct fallback: Selected closest available ambulance {selected_ambulance['number']} (ID: {selected_ambulance['id']})")

        amb_id = selected_ambulance["id"]
        amb_lat = float(selected_ambulance["latitude"])
        amb_lon = float(selected_ambulance["longitude"])

        # 4. Fetch initial OSRM routing details: Ambulance -> Patient
        logger.info(f"Calculating route from Ambulance {amb_id} ({amb_lat}, {amb_lon}) to Patient ({patient_lat}, {patient_lon})")
        route_data = fetch_osrm_route(amb_lat, amb_lon, patient_lat, patient_lon)
        route_coords = route_data["coordinates"]
        distance = route_data["distance"]
        duration = route_data["duration"]
        eta_str = f"{max(1, round(duration))} mins"

        # 5. Assign ambulance and save changes (with rollback transaction protection)
        log_id = dispatch_log_id if dispatch_log_id else str(uuid.uuid4())
        try:
            await ambulance_service.update_ambulance(amb_id, {
                "status": "DISPATCHED",
                "assigned_incident": incident_id,
                "assigned_hospital": hospital_id,
                "eta": eta_str
            })

            await ambulance_service.update_incident(incident_id, {
                "status": "DISPATCHED",
                "incident_status": "HOSPITAL_ACCEPTED"
            })
            
            # Save or update the dispatch log record
            dispatch_data = {
                "id": log_id,
                "ambulance_id": amb_id,
                "incident_id": incident_id,
                "hospital_id": hospital_id,
                "dispatch_time": datetime.now(timezone.utc).isoformat(),
                "status": "DISPATCHED",
                "dispatch_status": "ACCEPTED",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            if dispatch_log_id:
                await ambulance_service.update_dispatch(dispatch_log_id, dispatch_data)
            else:
                await ambulance_service.save_dispatch(dispatch_data)
        except Exception as e:
            logger.error(f"Error during ambulance dispatch assignment: {e}. Performing transaction rollback...")
            # Revert states in cache/DB
            await ambulance_service.update_ambulance(amb_id, {
                "status": "AVAILABLE",
                "assigned_incident": None,
                "assigned_hospital": None,
                "eta": None
            })
            await ambulance_service.update_incident(incident_id, {
                "status": "PENDING"
            })
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Dispatch transaction aborted: {str(e)}"
            )

        # 6. Start the background simulation loop
        movement_simulator.start_simulation(
            amb_id, incident_id, hospital_id, route_coords,
            patient_lat, patient_lon, hospital_lat, hospital_lon,
            dispatch_id=log_id
        )

        # 7. Broadcast WebSocket assignments to tracking clients
        assigned_event = {
            "type": "ambulance_assigned",
            "ambulance_id": amb_id,
            "incident_id": incident_id,
            "hospital_id": hospital_id,
            "eta": eta_str,
            "distance": round(distance, 1),
            "route": route_coords
        }
        await websocket_manager.broadcast(assigned_event)
        
        await websocket_manager.broadcast({
            "type": "ambulance_status_changed",
            "id": amb_id,
            "status": "DISPATCHED"
        })

        return {
            "ambulance": {
                "id": amb_id,
                "number": selected_ambulance["number"],
                "status": "DISPATCHED",
                "latitude": amb_lat,
                "longitude": amb_lon,
                "provider_id": selected_ambulance.get("provider_id"),
                "assigned_hospital": hospital_id,
                "assigned_incident": incident_id,
                "speed": selected_ambulance.get("speed", 40.0),
                "eta": eta_str
            },
            "eta": eta_str,
            "distance": round(distance, 1),
            "route": route_coords
        }

    async def reject_hospital(self, incident_id: str, hospital_id: str, dispatch_log_id: str) -> dict:
        """
        Hospital explicitly rejects emergency request -> mark log REJECTED and escalate to next hospital.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        await ambulance_service.update_dispatch(dispatch_log_id, {
            "dispatch_status": "REJECTED",
            "status": "REJECTED",
            "updated_at": now_str
        })
        await self._escalate_to_next_hospital(incident_id, dispatch_log_id)
        return {
            "success": True,
            "incident_id": incident_id,
            "dispatch_log_id": dispatch_log_id,
            "status": "REJECTED"
        }

    async def cancel_emergency(self, incident_id: str) -> dict:
        """
        User cancels the ongoing emergency -> stop escalation, stop simulation, mark CANCELLED, and broadcast event.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        self.cancel_escalation_monitor(incident_id)

        incident = await ambulance_service.get_incident(incident_id)

        if incident and incident.get("ambulance_id"):
            movement_simulator.stop_simulation(incident["ambulance_id"])
            await ambulance_service.update_ambulance(incident["ambulance_id"], {
                "status": "AVAILABLE",
                "assigned_incident": None,
                "assigned_hospital": None,
                "eta": None
            })

        await ambulance_service.update_incident(incident_id, {
            "incident_status": "CANCELLED",
            "status": "CANCELLED",
            "updated_at": now_str
        })

        dispatch_logs = [d for d in ambulance_service.dispatches.values() if d.get("incident_id") == incident_id]
        for d in dispatch_logs:
            if (d.get("status") or d.get("dispatch_status") or "").upper() in ("REQUESTED", "DISPATCHED", "PENDING"):
                await ambulance_service.update_dispatch(d["id"], {
                    "status": "CANCELLED",
                    "dispatch_status": "CANCELLED",
                    "updated_at": now_str
                })

        await websocket_manager.broadcast({
            "type": "emergency_cancelled",
            "incident_id": incident_id,
            "status": "CANCELLED",
            "timestamp": now_str
        })

        return {
            "success": True,
            "incident_id": incident_id,
            "status": "CANCELLED"
        }

    async def get_incident_status_summary(self, incident_id: str) -> dict:
        """
        Retrieve full persistent state summary for recovery on page refresh.
        """
        incident = await ambulance_service.get_incident(incident_id)
        if not incident:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Incident {incident_id} not found."
            )

        dispatch_logs = []
        client = ambulance_service._get_client()
        if client and ambulance_service.check_table_exists("dispatch_logs"):
            try:
                res = client.table("dispatch_logs").select("*").eq("incident_id", incident_id).execute()
                dispatch_logs = res.data or []
            except Exception as e:
                logger.warning(f"Failed to query dispatch_logs for status recovery: {e}")

        if not dispatch_logs:
            dispatch_logs = [d for d in ambulance_service.dispatches.values() if d.get("incident_id") == incident_id]
            dispatch_logs.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        active_log = dispatch_logs[0] if dispatch_logs else None

        selected_hosp_id = (active_log.get("hospital_id") if active_log else None) or incident.get("selected_hospital_id")
        hospital = None
        if selected_hosp_id:
            hospital = await self.get_hospital_details(selected_hosp_id)

        assigned_amb_id = (active_log.get("ambulance_id") if active_log else None) or incident.get("ambulance_id")
        ambulance = None
        if assigned_amb_id:
            ambulance = await ambulance_service.get_ambulance(assigned_amb_id)

        remaining_seconds = 0
        requested_at_iso = None
        if active_log:
            requested_at_iso = active_log.get("requested_at") or active_log.get("dispatch_time") or active_log.get("created_at")
            if requested_at_iso:
                try:
                    req_dt = datetime.fromisoformat(requested_at_iso.replace("Z", "+00:00"))
                    elapsed = (datetime.now(timezone.utc) - req_dt).total_seconds()
                    remaining_seconds = max(0, int(ESCALATION_TIMEOUT_SECONDS - elapsed))
                except Exception:
                    remaining_seconds = ESCALATION_TIMEOUT_SECONDS

        return {
            "incident": incident,
            "active_dispatch_log": active_log,
            "dispatch_logs": dispatch_logs,
            "hospital": hospital,
            "ambulance": ambulance,
            "timeout_seconds": ESCALATION_TIMEOUT_SECONDS,
            "remaining_seconds": remaining_seconds,
            "requested_at": requested_at_iso
        }

# Global singleton dispatch service instance
dispatch_service = DispatchService()
