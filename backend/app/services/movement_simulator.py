import asyncio
import logging
import urllib.request
import json
from typing import List, Dict, Any, Optional
from app.services.ambulance_service import ambulance_service
from app.services.websocket_manager import websocket_manager

logger = logging.getLogger(__name__)

def fetch_osrm_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> dict:
    """
    Query OSRM API for driving routes between coordinates with exponential fallback.
    """
    url = f"https://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson"
    headers = {
        "User-Agent": "CuraNode-Emergency-Triage-App/1.0 (contact@curanode.com)",
        "Referer": "https://curanode.com"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        # Standard urllib request
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            if data.get("routes") and len(data["routes"]) > 0:
                route = data["routes"][0]
                # Map OSRM coordinates (lon, lat) to Leaflet style (lat, lon)
                coordinates = [[c[1], c[0]] for c in route["geometry"]["coordinates"]]
                distance_km = route["distance"] / 1000.0
                duration_mins = route["duration"] / 60.0
                return {
                    "coordinates": coordinates,
                    "distance": distance_km,
                    "duration": duration_mins
                }
    except Exception as e:
        logger.warning(f"OSRM routing query failed: {e}. Falling back to straight-line interpolation.")
    
    # Graceful fallback: interpolate a straight line with 15 steps
    steps = 15
    coordinates = []
    for i in range(steps + 1):
        ratio = i / steps
        lat = start_lat + (end_lat - start_lat) * ratio
        lon = start_lon + (end_lon - start_lon) * ratio
        coordinates.append([lat, lon])
    
    return {
        "coordinates": coordinates,
        "distance": 5.0,  # approximate placeholder
        "duration": 7.5   # approximate placeholder (assuming ~40 km/h)
    }

class MovementSimulator:
    def __init__(self):
        self._active_tasks: Dict[str, asyncio.Task] = {}

    def start_simulation(self, amb_id: str, incident_id: str, hospital_id: str, initial_route: List[List[float]], patient_lat: float, patient_lon: float, hospital_lat: float, hospital_lon: float, dispatch_id: Optional[str] = None):
        """
        Launches the simulation background task.
        """
        # Cancel any existing simulation task for this ambulance
        self.stop_simulation(amb_id)

        task = asyncio.create_task(
            self._simulate_ambulance_lifecycle(
                amb_id, incident_id, hospital_id, initial_route,
                patient_lat, patient_lon, hospital_lat, hospital_lon,
                dispatch_id
            )
        )
        self._active_tasks[amb_id] = task

    def stop_simulation(self, amb_id: str):
        """
        Cancels the active simulation task for an ambulance.
        """
        if amb_id in self._active_tasks:
            task = self._active_tasks[amb_id]
            task.cancel()
            del self._active_tasks[amb_id]
            logger.info(f"Stopped active simulation for ambulance {amb_id}")

    async def _simulate_ambulance_lifecycle(
        self, amb_id: str, incident_id: str, hospital_id: str, initial_route: List[List[float]],
        patient_lat: float, patient_lon: float, hospital_lat: float, hospital_lon: float,
        dispatch_id: Optional[str] = None
    ):
        try:
            # --- PHASE 1: AMBULANCE TO PATIENT ---
            logger.info(f"Starting Phase 1 for ambulance {amb_id} (Ambulance -> Patient)")
            
            # Use a step rate to complete coordinates in ~120 seconds for demo simulation
            route = initial_route
            num_coords = len(route)
            steps = 120
            step_size = max(1, num_coords // steps)
            
            # Move along the polyline
            for idx in range(0, num_coords, step_size):
                if idx >= num_coords:
                    idx = num_coords - 1
                
                coords = route[idx]
                # Calculate remaining ratio
                remaining_coords = num_coords - idx
                ratio = remaining_coords / num_coords
                
                # Update status details (2 minutes scale down)
                eta_val = max(1, int(round(2 * ratio))) if ratio > 0 else 0
                eta_str = f"{eta_val} mins"
                
                await ambulance_service.update_ambulance(amb_id, {
                    "latitude": coords[0],
                    "longitude": coords[1],
                    "status": "DISPATCHED",
                    "eta": eta_str
                })
                
                # Broadcast real-time websocket details
                await websocket_manager.broadcast({
                    "type": "ambulance_location",
                    "id": amb_id,
                    "latitude": coords[0],
                    "longitude": coords[1],
                    "status": "DISPATCHED",
                    "eta": eta_str
                })
                
                await websocket_manager.broadcast({
                    "type": "eta_updated",
                    "id": amb_id,
                    "eta": eta_str
                })
                
                await asyncio.sleep(1)
            
            # Snap to exact patient coordinate
            await ambulance_service.update_ambulance(amb_id, {
                "latitude": patient_lat,
                "longitude": patient_lon,
                "status": "AT_PATIENT",
                "eta": "0 mins"
            })
            
            await websocket_manager.broadcast({
                "type": "ambulance_location",
                "id": amb_id,
                "latitude": patient_lat,
                "longitude": patient_lon,
                "status": "AT_PATIENT",
                "eta": "0 mins"
            })
            
            await websocket_manager.broadcast({
                "type": "ambulance_status_changed",
                "id": amb_id,
                "status": "AT_PATIENT"
            })
            
            await websocket_manager.broadcast({
                "type": "ambulance_arrived_patient",
                "id": amb_id,
                "incident_id": incident_id
            })
            
            # Wait at patient for 2 seconds to simulate intake loading
            logger.info(f"Ambulance {amb_id} loading patient at location...")
            await asyncio.sleep(2)
            
            await websocket_manager.broadcast({
                "type": "patient_picked_up",
                "id": amb_id,
                "incident_id": incident_id,
                "hospital_id": hospital_id
            })
            
            # --- PHASE 2: PATIENT TO HOSPITAL ---
            logger.info(f"Starting Phase 2 for ambulance {amb_id} (Patient -> Hospital)")
            
            # Fetch route coordinates from patient coordinates to hospital coordinates
            hosp_route_data = fetch_osrm_route(patient_lat, patient_lon, hospital_lat, hospital_lon)
            hosp_route = hosp_route_data["coordinates"]
            hosp_num_coords = len(hosp_route)
            hosp_step_size = max(1, hosp_num_coords // steps)
            
            await ambulance_service.update_ambulance(amb_id, {
                "status": "TRANSPORTING",
                "assigned_hospital": hospital_id
            })
            
            await websocket_manager.broadcast({
                "type": "ambulance_status_changed",
                "id": amb_id,
                "status": "TRANSPORTING"
            })
            
            # Send initial route path to client for Patient -> Hospital
            await websocket_manager.broadcast({
                "type": "ambulance_route_changed",
                "id": amb_id,
                "route": hosp_route,
                "status": "TRANSPORTING"
            })

            # Move along the polyline
            for idx in range(0, hosp_num_coords, hosp_step_size):
                if idx >= hosp_num_coords:
                    idx = hosp_num_coords - 1
                
                coords = hosp_route[idx]
                remaining_coords = hosp_num_coords - idx
                ratio = remaining_coords / hosp_num_coords
                
                eta_val = max(1, round(12 * ratio))
                eta_str = f"{eta_val} mins"
                
                await ambulance_service.update_ambulance(amb_id, {
                    "latitude": coords[0],
                    "longitude": coords[1],
                    "status": "TRANSPORTING",
                    "eta": eta_str
                })
                
                await websocket_manager.broadcast({
                    "type": "ambulance_location",
                    "id": amb_id,
                    "latitude": coords[0],
                    "longitude": coords[1],
                    "status": "TRANSPORTING",
                    "eta": eta_str
                })
                
                await websocket_manager.broadcast({
                    "type": "eta_updated",
                    "id": amb_id,
                    "eta": eta_str
                })
                
                await asyncio.sleep(1)

            # Snap to final hospital coordinate and complete lifecycle
            await ambulance_service.update_ambulance(amb_id, {
                "latitude": hospital_lat,
                "longitude": hospital_lon,
                "status": "AVAILABLE",
                "assigned_hospital": None,
                "assigned_incident": None,
                "eta": None
            })
            
            await ambulance_service.update_incident(incident_id, {
                "status": "COMPLETED"
            })
            
            # Log completed dispatch log
            # Try to log
            from datetime import datetime, timezone
            completed_time_iso = datetime.now(timezone.utc).isoformat()
            
            if dispatch_id:
                try:
                    await ambulance_service.update_dispatch(dispatch_id, {
                        "status": "COMPLETED",
                        "completed_time": completed_time_iso
                    })
                except Exception as e:
                    logger.warning(f"Could not update dispatch state for {dispatch_id}: {e}")
            else:
                # Search by incident state as fallback
                try:
                    client = ambulance_service._get_client()
                    if ambulance_service.check_table_exists("dispatches"):
                        res = client.table("dispatches").select("id").eq("incident_id", incident_id).eq("status", "DISPATCHED").execute()
                        if res.data:
                            target_id = res.data[0]["id"]
                            await ambulance_service.update_dispatch(target_id, {
                                "status": "COMPLETED",
                                "completed_time": completed_time_iso
                            })
                    elif ambulance_service.check_table_exists("dispatch_logs"):
                        res = client.table("dispatch_logs").select("id").eq("incident_id", incident_id).eq("status", "DISPATCHED").execute()
                        if res.data:
                            target_id = res.data[0]["id"]
                            await ambulance_service.update_dispatch(target_id, {
                                "status": "COMPLETED",
                                "completed_time": completed_time_iso
                            })
                except Exception as e:
                    logger.warning(f"Could not locate and update dispatch for incident {incident_id}: {e}")

            # Send complete alerts
            await websocket_manager.broadcast({
                "type": "hospital_arrived",
                "id": amb_id,
                "hospital_id": hospital_id
            })
            
            await websocket_manager.broadcast({
                "type": "incident_completed",
                "incident_id": incident_id
            })
            
            await websocket_manager.broadcast({
                "type": "ambulance_status_changed",
                "id": amb_id,
                "status": "AVAILABLE"
            })
            
            logger.info(f"Completed dispatch cycle for ambulance {amb_id} successfully.")

        except asyncio.CancelledError:
            logger.info(f"Lifecycle task for ambulance {amb_id} cancelled.")
        except Exception as e:
            logger.error(f"Simulator error for ambulance {amb_id}: {e}", exc_info=True)
        finally:
            if amb_id in self._active_tasks:
                del self._active_tasks[amb_id]

# Global singleton movement simulator instance
movement_simulator = MovementSimulator()
