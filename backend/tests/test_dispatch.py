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
from app.services.movement_simulator import movement_simulator

async def test_dispatch_async():
    print("\n--- Running Ambulance Dispatch Service Async Tests ---")
    
    # 1. Create a dummy incident in state to dispatch to
    incident_id = str(uuid.uuid4())
    patient_coords = {"latitude": 13.0827, "longitude": 80.2707} # Chennai center
    
    await ambulance_service.save_incident({
        "id": incident_id,
        "latitude": patient_coords["latitude"],
        "longitude": patient_coords["longitude"],
        "severity_score": 8,
        "severity_level": "High",
        "status": "PENDING"
    })
    print(f"Created test incident: {incident_id}")

    # Reset all ambulances to AVAILABLE for testing
    all_ambs = await ambulance_service.get_all_ambulances()
    for a in all_ambs:
        await ambulance_service.update_ambulance(a["id"], {
            "status": "AVAILABLE",
            "assigned_incident": None,
            "assigned_hospital": None,
            "eta": None
        })
    print("Reset test ambulances status to AVAILABLE.")

    # 2. Call dispatch_ambulance directly in our async loop
    hospital_id = "1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66" # Apollo Emergency Center
    result = await dispatch_service.dispatch_ambulance(incident_id, hospital_id)
    
    # 3. Assert Response Fields and Schemas
    assert "ambulance" in result, "Missing 'ambulance' object"
    assert "eta" in result, "Missing 'eta' field"
    assert "distance" in result, "Missing 'distance' field"
    assert "route" in result, "Missing 'route' coordinates"
    
    amb = result["ambulance"]
    assert amb["status"] == "DISPATCHED", f"Expected DISPATCHED status, got {amb['status']}"
    assert amb["assigned_incident"] == incident_id, f"Expected incident assignment to match {incident_id}"
    assert amb["assigned_hospital"] == hospital_id, f"Expected hospital assignment to match {hospital_id}"
    assert len(result["route"]) > 0, "Route coordinates must not be empty"
    
    amb_id = amb["id"]
    initial_lat = amb["latitude"]
    initial_lon = amb["longitude"]
    print(f"Ambulance {amb['number']} (ID: {amb_id}) successfully dispatched. Initial coords: ({initial_lat}, {initial_lon})")

    # 4. Wait for the simulation task to run for a few ticks
    print("Waiting 3 seconds for simulation movement updates...")
    await asyncio.sleep(3)
    
    # Query current ambulance details
    updated_amb = await ambulance_service.get_ambulance(amb_id)
    current_lat = float(updated_amb["latitude"])
    current_lon = float(updated_amb["longitude"])
    current_status = updated_amb["status"]
    current_eta = updated_amb["eta"]
    
    print(f"Ambulance details after 3s: Status={current_status}, ETA={current_eta}, Coords=({current_lat}, {current_lon})")
    
    # Assert coordinates have updated and moved along the polyline path
    assert (current_lat != initial_lat) or (current_lon != initial_lon), "Ambulance coordinates did not move! Simulation is stuck."
    print("Verified that ambulance is moving smoothly along OSRM route path!")

    # 5. Clean up/cancel the background task
    movement_simulator.stop_simulation(amb_id)
    print("Standard dispatch tests completed successfully.")

async def test_preferred_dispatch_async():
    print("\n--- Running Preferred Ambulance Selection Logic Tests ---")
    
    # Setup controlled ambulance locations
    # Hospital ID: 1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66 (Apollo)
    # Ambulance 1 (Apollo Hospital Provider): further away (latitude=13.12, longitude=80.30)
    # Ambulance 2 (Govt Provider): very close to patient (latitude=13.0827, longitude=80.2707)
    
    # Patient location: (13.0827, 80.2707)
    incident_id_1 = str(uuid.uuid4())
    await ambulance_service.save_incident({
        "id": incident_id_1,
        "latitude": 13.0827,
        "longitude": 80.2707,
        "severity_score": 7,
        "severity_level": "High",
        "status": "PENDING"
    })
    
    # Reconfigure ambulance coordinates and statuses
    await ambulance_service.update_ambulance("1", {
        "status": "AVAILABLE",
        "latitude": 13.12,
        "longitude": 80.30,
        "assigned_incident": None,
        "assigned_hospital": None
    })
    await ambulance_service.update_ambulance("2", {
        "status": "AVAILABLE",
        "latitude": 13.0827,
        "longitude": 80.2707,
        "assigned_incident": None,
        "assigned_hospital": None
    })
    
    # Trigger dispatch to Apollo hospital.
    # Apollo provider is '1a111111-1111-1111-1111-111111111111', which owns Ambulance 1.
    # So Ambulance 1 should be selected even though Ambulance 2 is closer.
    hospital_id = "1a3b5c7d-9e11-4b22-8c33-ad44ee55ff66"
    print("Dispatching to Apollo Hospital: expecting Ambulance 1 (hospital-owned) to be preferred over closer Ambulance 2...")
    result1 = await dispatch_service.dispatch_ambulance(incident_id_1, hospital_id)
    
    selected_amb = result1["ambulance"]
    print(f"Dispatched Ambulance: ID={selected_amb['id']}, Number={selected_amb['number']}")
    assert selected_amb["id"] == "1", f"Expected Ambulance 1 to be preferred, but got Ambulance {selected_amb['id']}"
    print("SUCCESS: Hospital-owned ambulance was successfully preferred!")
    
    # Stop simulation for ambulance 1
    movement_simulator.stop_simulation("1")

    # Now, Ambulance 1 is marked as DISPATCHED (busy).
    # Trigger another dispatch to Apollo. Since no hospital-owned ambulances are available,
    # it should fall back to the available government/private ambulance (Ambulance 2).
    incident_id_2 = str(uuid.uuid4())
    await ambulance_service.save_incident({
        "id": incident_id_2,
        "latitude": 13.0827,
        "longitude": 80.2707,
        "severity_score": 5,
        "severity_level": "Medium",
        "status": "PENDING"
    })
    
    print("\nDispatching to Apollo Hospital while Ambulance 1 is busy: expecting fallback to Ambulance 2 (government-owned)...")
    result2 = await dispatch_service.dispatch_ambulance(incident_id_2, hospital_id)
    
    selected_amb2 = result2["ambulance"]
    print(f"Dispatched Ambulance: ID={selected_amb2['id']}, Number={selected_amb2['number']}")
    assert selected_amb2["id"] == "2", f"Expected Ambulance 2 fallback, but got Ambulance {selected_amb2['id']}"
    print("SUCCESS: Fallback to government/private ambulance worked perfectly!")
    
    # Stop simulation for ambulance 2
    movement_simulator.stop_simulation("2")
    
    print("\nPreferred ambulance selection logic tests completed successfully!")

async def run_all_tests():
    await test_dispatch_async()
    await test_preferred_dispatch_async()
    print("\nAll backend dispatch and workflow tests completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_all_tests())
