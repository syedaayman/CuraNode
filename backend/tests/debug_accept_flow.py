import os
import sys
import uuid
import json
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
from app.api.dispatch import accept_emergency

async def debug_accept_pipeline():
    print("=====================================================")
    print("STEP 1: CREATING REAL EMERGENCY INCIDENT & DISPATCH LOG")
    print("=====================================================")

    incident_id = str(uuid.uuid4())
    patient_coords = {"latitude": 13.0827, "longitude": 80.2707}

    await ambulance_service.save_incident({
        "id": incident_id,
        "latitude": patient_coords["latitude"],
        "longitude": patient_coords["longitude"],
        "severity_score": 9,
        "severity_level": "High",
        "status": "PENDING"
    })

    hospitals = await hospital_service.get_ranked_hospitals(9, patient_coords["latitude"], patient_coords["longitude"])
    hosp = hospitals[0]
    hospital_id = hosp["id"]
    hospital_name = hosp["name"]

    dispatch_log_id = str(uuid.uuid4())
    await ambulance_service.save_dispatch({
        "id": dispatch_log_id,
        "incident_id": incident_id,
        "hospital_id": hospital_id,
        "status": "REQUESTED"
    })

    print(f"INCIDENT_ID (used by patient): {incident_id}")
    print(f"HOSPITAL_ID (used by patient):  {hospital_id}")
    print(f"HOSPITAL_NAME:                 {hospital_name}")
    print(f"DISPATCH_LOG_ID:               {dispatch_log_id}")

    print("\n=====================================================")
    print("STEP 2: SUPABASE RECORDS BEFORE ACCEPTANCE")
    print("=====================================================")
    client = ambulance_service._get_client()
    
    inc_before = client.table("incidents").select("*").eq("id", incident_id).execute()
    disp_before = client.table("dispatch_logs").select("*").eq("id", dispatch_log_id).execute()

    print(f"Table 'incidents' BEFORE:     status = '{inc_before.data[0].get('status')}'")
    print(f"Table 'dispatch_logs' BEFORE: status = '{disp_before.data[0].get('status')}'")
    print(f"Full Incident Row BEFORE:     {inc_before.data[0]}")
    print(f"Full Dispatch Log Row BEFORE: {disp_before.data[0]}")

    print("\n=====================================================")
    print("STEP 3: HOSPITAL DASHBOARD CALLS POST /api/accept-emergency")
    print("=====================================================")
    
    accept_payload = AcceptEmergencyReq(
        incident_id=incident_id,
        hospital_id=hospital_id,
        dispatch_log_id=dispatch_log_id
    )
    print(f"Accept Payload sent by Hospital Dashboard: {accept_payload.model_dump()}")
    
    res = await accept_emergency(accept_payload)
    print(f"Backend Endpoint Response: {res}")

    print("\n=====================================================")
    print("STEP 4: SUPABASE RECORDS AFTER ACCEPTANCE")
    print("=====================================================")
    
    inc_after = client.table("incidents").select("*").eq("id", incident_id).execute()
    disp_after = client.table("dispatch_logs").select("*").eq("id", dispatch_log_id).execute()

    print(f"Table 'incidents' AFTER:     status = '{inc_after.data[0].get('status')}'")
    print(f"Table 'dispatch_logs' AFTER: status = '{disp_after.data[0].get('status')}'")
    print(f"Full Incident Row AFTER:     {inc_after.data[0]}")
    print(f"Full Dispatch Log Row AFTER: {disp_after.data[0]}")

    print("\n=====================================================")
    print("STEP 5: PATIENT GET /api/incident/{incident_id}/status RESPONSE")
    print("=====================================================")
    
    summary = await dispatch_service.get_incident_status_summary(incident_id)
    print(f"Summary Response Payload: {json.dumps(summary, indent=2, default=str)}")

if __name__ == "__main__":
    asyncio.run(debug_accept_pipeline())
