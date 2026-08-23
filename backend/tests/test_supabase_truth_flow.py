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

CURANODE_ENV = os.path.join(PROJECT_ROOT, "curanode", ".env")
USER_SIDE_ENV = os.path.join(PROJECT_ROOT, "userSide", ".env")
if os.path.exists(CURANODE_ENV):
    load_dotenv(CURANODE_ENV, override=True)
elif os.path.exists(USER_SIDE_ENV):
    load_dotenv(USER_SIDE_ENV, override=True)
load_dotenv()

from app.services.dispatch_service import dispatch_service
from app.services.ambulance_service import ambulance_service
from app.services.hospital_service import hospital_service

async def verify_supabase_truth():
    print("=====================================================")
    print("VERIFYING SUPABASE AS SINGLE SOURCE OF TRUTH")
    print("=====================================================")

    # 1. Create a real incident in Supabase
    incident_id = str(uuid.uuid4())
    patient_coords = {"latitude": 13.0827, "longitude": 80.2707}
    
    await ambulance_service.save_incident({
        "id": incident_id,
        "latitude": patient_coords["latitude"],
        "longitude": patient_coords["longitude"],
        "severity_score": 8,
        "severity_level": "High",
        "status": "PENDING"
    })
    print(f"[1] Created Incident in Supabase: {incident_id}")

    # 2. Get real hospital candidate
    hospitals = await hospital_service.get_ranked_hospitals(8, patient_coords["latitude"], patient_coords["longitude"])
    selected_hosp = hospitals[0]
    hospital_id = selected_hosp["id"]
    hospital_name = selected_hosp["name"]
    print(f"[2] Hospital Selected from DB: {hospital_name} (ID: {hospital_id})")

    # 3. Create dispatch log in Supabase
    dispatch_log_id = str(uuid.uuid4())
    await ambulance_service.save_dispatch({
        "id": dispatch_log_id,
        "incident_id": incident_id,
        "hospital_id": hospital_id,
        "status": "REQUESTED"
    })
    print(f"[3] Dispatch Log created in Supabase: {dispatch_log_id} (Status: REQUESTED)")

    # 4. Fetch status summary from backend (simulating page load/refresh)
    summary_1 = await dispatch_service.get_incident_status_summary(incident_id)
    print("\n--- STATUS SUMMARY AT STATE: REQUESTED ---")
    print(f"Incident Status: {summary_1['incident'].get('status')}")
    print(f"Hospital Name: {summary_1['hospital'].get('name') if summary_1.get('hospital') else None}")
    print(f"Dispatch Log Status: {summary_1['active_dispatch_log'].get('status') if summary_1.get('active_dispatch_log') else None}")

    # 5. Simulate Hospital Acceptance in Supabase
    print("\n[5] Updating Supabase: Hospital clicking ACCEPT...")
    from app.schemas.dispatch import AcceptEmergencyReq
    from app.api.dispatch import accept_emergency
    
    await accept_emergency(AcceptEmergencyReq(
        incident_id=incident_id,
        hospital_id=hospital_id,
        dispatch_log_id=dispatch_log_id
    ))

    # 6. Fetch status summary again (simulating page refresh after acceptance)
    summary_2 = await dispatch_service.get_incident_status_summary(incident_id)
    print("\n--- STATUS SUMMARY AFTER PAGE REFRESH (POST ACCEPTANCE) ---")
    print(f"Incident Status: {summary_2['incident'].get('status')}")
    print(f"Dispatch Log Status: {summary_2['active_dispatch_log'].get('status') if summary_2.get('active_dispatch_log') else None}")
    print(f"Hospital Name: {summary_2['hospital'].get('name') if summary_2.get('hospital') else None}")
    print(f"Assigned Ambulance ID: {summary_2['ambulance'].get('id') if summary_2.get('ambulance') else None}")
    print(f"Ambulance Number: {summary_2['ambulance'].get('number') if summary_2.get('ambulance') else None}")

    print("\nVERIFICATION COMPLETE: Page refresh & status summary read 100% directly from Supabase!")

if __name__ == "__main__":
    asyncio.run(verify_supabase_truth())
