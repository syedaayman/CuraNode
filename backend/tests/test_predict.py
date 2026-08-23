import os
import sys
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

from fastapi.testclient import TestClient
from app.main import app

# Ensure test image exists
img_path = os.path.join(BACKEND_DIR, "temp", "test_image.jpg")
if not os.path.exists(img_path):
    from PIL import Image
    os.makedirs(os.path.dirname(img_path), exist_ok=True)
    img = Image.new('RGB', (100, 100), color = 'red')
    img.save(img_path)
    print(f"Created test image at: {img_path}")

print("Initializing FastAPI TestClient...")
client = TestClient(app)

print("Sending POST /predict request...")
try:
    with open(img_path, "rb") as f:
        files = {"file": ("test_image.jpg", f, "image/jpeg")}
        # Mock coordinates near Apollo Emergency Center (13.0604, 80.2496)
        data_payload = {"latitude": "13.06", "longitude": "80.25"}
        response = client.post("/predict", files=files, data=data_payload)
        
    print(f"Status Code: {response.status_code}")
    if response.status_code != 200:
        print(f"Error Response: {response.text}")
        sys.exit(1)
        
    data = response.json()
    print("Response JSON:")
    import json
    print(json.dumps(data, indent=2))
    
    # Assert expected fields matching SeverityResponse schema
    assert "severity_score" in data, "Missing severity_score"
    assert "severity_level" in data, "Missing severity_level"
    assert "confidence" in data, "Missing confidence"
    assert "analysis" in data, "Missing analysis"
    assert "hospitals" in data, "Missing hospitals"
    
    # Assert value types and bounds
    assert isinstance(data["severity_score"], int), "severity_score must be an integer"
    assert 1 <= data["severity_score"] <= 10, "severity_score must be between 1 and 10"
    assert data["severity_level"] in {"Low", "Medium", "High", "Critical"}, f"Invalid severity_level: {data['severity_level']}"
    assert isinstance(data["confidence"], float), "confidence must be a float"
    assert 0.0 <= data["confidence"] <= 1.0, "confidence must be between 0.0 and 1.0"
    assert isinstance(data["analysis"], str) and len(data["analysis"]) > 0, "analysis must be a non-empty string"
    
    hospitals_list = data["hospitals"]
    assert isinstance(hospitals_list, list), "hospitals must be a list"
    assert len(hospitals_list) <= 3, f"Expected at most 3 hospitals, got {len(hospitals_list)}"
    
    # Check deduplication
    ids = [h.get("id") for h in hospitals_list]
    assert len(ids) == len(set(ids)), "Found duplicate hospital entries in response!"
    
    # Check hospital fields present
    for h in hospitals_list:
        assert "distance" in h, f"Missing distance field in hospital: {h.get('name')}"
        assert "estimated_travel_time" in h, f"Missing estimated_travel_time in hospital: {h.get('name')}"
        print(f"Verified hospital card data: {h.get('name')}, Distance: {h.get('distance')} km, Travel Time: {h.get('estimated_travel_time')} mins, ICU: {h.get('has_icu')}")
        
    print("\nAll integration and schema checks passed successfully!")
    sys.exit(0)
    
except Exception as e:
    print(f"Test failed with error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
