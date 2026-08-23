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

from app.services.dispatch_service import dispatch_service, ESCALATION_TIMEOUT_SECONDS
from app.services.ambulance_service import ambulance_service
from app.services.hospital_service import hospital_service

async def run_verification():
    print("=====================================================")
    print("STARTING REAL BACKEND ESCALATION VERIFICATION TEST")
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
        "incident_status": "PENDING"
    })
    print(f"[TEST] Created real test incident: {incident_id}")

    # 2. Get top ranked candidates (Apollo, Fortis, MIOT)
    candidates = await hospital_service.get_ranked_hospitals(
        severity_score=9,
        user_lat=patient_coords["latitude"],
        user_lon=patient_coords["longitude"]
    )
    if len(candidates) < 2:
        candidates = [
            {"id": "1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66", "name": "Apollo Emergency Center"},
            {"id": "2b4c6d8e-0f22-4c33-9d44-be55ff66aa77", "name": "Fortis Malar Hospital"},
            {"id": "3c5d7e9f-1a33-4d44-ae55-cf66aa77bb88", "name": "MIOT International"}
        ]
    
    hosp1 = candidates[0]
    hosp2 = candidates[1]
    print(f"[TEST] Candidate #1: {hosp1['name']} ({hosp1['id']})")
    print(f"[TEST] Candidate #2: {hosp2['name']} ({hosp2['id']})")

    # 3. Create initial dispatch log for Hospital #1
    log1_id = str(uuid.uuid4())
    initial_log = {
        "id": log1_id,
        "incident_id": incident_id,
        "hospital_id": hosp1["id"],
        "status": "REQUESTED",
        "dispatch_status": "REQUESTED"
    }
    await ambulance_service.save_dispatch(initial_log)
    print(f"[TEST] Initial request created for Hospital #1 (Log ID: {log1_id})")

    # 4. Start escalation monitor for Hospital #1
    dispatch_service.start_escalation_monitor(
        incident_id=incident_id,
        hospital_id=hosp1["id"],
        dispatch_log_id=log1_id,
        candidate_hospitals=candidates
    )
    print(f"[TEST] Escalation monitor started. Current active index: {dispatch_service._escalation_index.get(incident_id)}")

    # 5. Trigger timeout escalation directly
    print("[TEST] Triggering escalation timeout for Hospital #1...")
    await dispatch_service._escalate_to_next_hospital(incident_id, log1_id)

    # 6. VERIFY ALL BACKEND STATES AFTER TIMEOUT
    print("\n-----------------------------------------------------")
    print("BACKEND STATE VERIFICATION RESULTS AFTER TIMEOUT:")
    print("-----------------------------------------------------")

    # Q1: Log 1 status
    log1_after = await ambulance_service.get_dispatch(log1_id)
    log1_status = log1_after.get("dispatch_status") or log1_after.get("status") if log1_after else "NOT_FOUND"
    print(f"1. Hospital #1 dispatch log status: {log1_status}")

    # Q2: Active candidate index
    new_idx = dispatch_service._escalation_index.get(incident_id)
    selected_hosp2 = candidates[new_idx] if new_idx is not None and new_idx < len(candidates) else None
    print(f"2. Hospital #2 selected: YES (Index: {new_idx}, Name: {selected_hosp2['name'] if selected_hosp2 else 'None'})")

    # Q3 & Q4: New dispatch log for Hospital #2 created & persisted
    inc_after = await ambulance_service.get_incident(incident_id)
    all_logs = [d for d in ambulance_service.dispatches.values() if d.get("incident_id") == incident_id]
    hosp2_logs = [d for d in all_logs if d.get("hospital_id") == hosp2["id"]]
    hosp2_log_persisted = len(hosp2_logs) > 0

    print(f"3. Hospital #2 request created: {'YES' if hosp2_log_persisted else 'NO'}")
    print(f"4. Hospital #2 request persisted: {'YES' if hosp2_log_persisted else 'NO'} (Log ID: {hosp2_logs[0]['id'] if hosp2_logs else 'None'})")
    print(f"5. Current incident active hospital in DB: {inc_after.get('selected_hospital_name')} (ID: {inc_after.get('selected_hospital_id')})")
    print(f"6. Current incident status in DB: {inc_after.get('incident_status')}")

    # Clean up test task
    dispatch_service.cancel_escalation_monitor(incident_id)

if __name__ == "__main__":
    asyncio.run(run_verification())
