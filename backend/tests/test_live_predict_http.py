import requests
import os

test_img_path = "test_sample_live.jpg"
from PIL import Image
img = Image.new("RGB", (100, 100), color="blue")
img.save(test_img_path)

try:
    with open(test_img_path, "rb") as f:
        files = {"file": ("test_sample_live.jpg", f, "image/jpeg")}
        data = {"latitude": "13.0827", "longitude": "80.2707"}
        
        print("Sending POST request to http://127.0.0.1:8001/predict ...")
        resp = requests.post("http://127.0.0.1:8001/predict", files=files, data=data, timeout=30)
        
        print(f"Response Status Code: {resp.status_code}")
        print(f"Response Text: {resp.text}")
except Exception as e:
    print(f"HTTP Request Exception: {e}")
finally:
    if os.path.exists(test_img_path):
        os.remove(test_img_path)
