import os
import sys
import asyncio
from PIL import Image
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

from app.services.gemini_service import gemini_service

async def test_gemini():
    print("=====================================================")
    print("TESTING DIRECT GEMINI API CALL")
    print("=====================================================")
    
    api_key = os.getenv("GEMINI_API_KEY")
    print(f"GEMINI_API_KEY present: {bool(api_key)}")
    if api_key:
        print(f"GEMINI_API_KEY prefix: {api_key[:6]}...")
    
    # Create a small dummy test image
    test_img_path = os.path.join(BACKEND_DIR, "test_injury_sample.jpg")
    img = Image.new("RGB", (100, 100), color="red")
    img.save(test_img_path)

    try:
        res = await gemini_service.analyze_injury_image(test_img_path)
        print("\nGemini API Response Success:")
        print(res)
    except Exception as e:
        print(f"\nGemini API Failed with Exception Type: {type(e)}")
        print(f"Exception Message: {str(e)}")
        if hasattr(e, "detail"):
            print(f"HTTPException Detail: {e.detail}")
    finally:
        if os.path.exists(test_img_path):
            os.remove(test_img_path)

if __name__ == "__main__":
    asyncio.run(test_gemini())
