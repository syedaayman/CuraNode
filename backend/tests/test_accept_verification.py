import os
import sys
import uuid
import asyncio
from dotenv import load_dotenv

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(TESTS_DIR)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

USER_SIDE_ENV = os.path.join(PROJECT_ROOT, "userSide", ".env")
CURANODE_ENV = os.path.join(PROJECT_ROOT, "curanode", ".env")
if os.path.exists(USER_SIDE_ENV):
    load_dotenv(USER_SIDE_ENV, override=True)
elif os.path.exists(CURANODE_ENV):
    load_dotenv(CURANODE_ENV, override=True)
load_dotenv()

from app.services.dispatch_service import dispatch_service
from app.services.ambulance_service import ambulance_service
from app.services.hospital_service import hospital_service
from app.schemas.dispatch import AcceptEmergencyReq

async def run_accept_test():
    print("=====================================================")
    print("STARTING REAL HOSPITAL ACCEPTANCE VERIFICATION TEST")
    print("=====================================================")

    # 1. Create a real incident
    incident_id = str(uuid.uuid4())
    patient_coords = {"latitude": 13.0827, "longitude": 80.2707}
    
    await ambulance_service.save_incident({
        "id": incident_id,
        "latitude": patient_coords["latitude"],
        "longitude": patient_coords["longitude"],
        "severity_score": 9,
        "severity_level": "Critical",
        "status": "PENDING",
        "incident_status": "PENDING_HOSPITAL_ACCEPTANCE"
    })
    print(f"[TEST] Created incident: {incident_id}")

    # 2. Get active hospital candidate (Apollo Emergency Center)
    hospitals = await hospital_service.get_ranked_hospitals(severity_score=9, user_lat=patient_coords["latitude"], user_lon=patient_coords["longitude"])
    target_hospital = hospitals[0] if hospitals else {

        "id": "1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66",
        "name": "Apollo Emergency Center",
        "latitude": 13.0604,
        "longitude": 80.2496
    }
    hospital_id = target_hospital["id"]
    print(f"[TEST] Hospital: {target_hospital.get('name')} (ID: {hospital_id})")

    # 3. Create initial dispatch log
    dispatch_log_id = str(uuid.uuid4())
    await ambulance_service.save_dispatch({
        "id": dispatch_log_id,
        "incident_id": incident_id,
        "hospital_id": hospital_id,
        "status": "REQUESTED"
    })
    print(f"[TEST] Created dispatch log: {dispatch_log_id}")

    # 4. Trigger accept_emergency endpoint flow
    print("[TEST] Hospital Dashboard clicking ACCEPT...")
    req = AcceptEmergencyReq(
        incident_id=incident_id,
        hospital_id=hospital_id,
        dispatch_log_id=dispatch_log_id
    )

    from app.api.dispatch import accept_emergency
    res = await accept_emergency(req)

    print("\n-----------------------------------------------------")
    print("ACCEPTANCE VERIFICATION RESULTS:")
    print("-----------------------------------------------------")

    # Verify DB updates
    updated_inc = await ambulance_service.get_incident(incident_id)
    updated_log = await ambulance_service.get_dispatch(dispatch_log_id)

    print(f"1. Incident status in DB: {updated_inc.get('incident_status')}")
    print(f"2. Dispatch log status in DB: {updated_log.get('status') or updated_log.get('dispatch_status')}")
    print(f"3. Assigned Ambulance ID: {res.get('ambulance', {}).get('id')}")
    print(f"4. OSRM Road Route coordinates count: {len(res.get('route', []))}")
    print(f"5. Calculated Travel ETA: {res.get('eta')}")
    print(f"6. Calculated Distance: {res.get('distance')} km")

if __name__ == "__main__":
    asyncio.run(run_accept_test())
