import os
import sys
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

from app.services.hospital_service import hospital_service
from app.services.ambulance_service import ambulance_service

async def inspect_supabase():
    print("=====================================================")
    print("SUPABASE SCHEMA & SINGLE SOURCE OF TRUTH AUDIT")
    print("=====================================================")

    client = hospital_service._get_client()
    if not client:
        print("ERROR: Supabase client connection unavailable.")
        return

    tables = ["incidents", "hospitals", "dispatch_logs", "ambulances", "dispatches", "ambulance_providers"]

    for t in tables:
        try:
            res = client.table(t).select("*").limit(5).execute()
            print(f"\n--- TABLE: {t} ---")
            print(f"Row Count Sample: {len(res.data)}")
            if res.data and len(res.data) > 0:
                print(f"Columns: {list(res.data[0].keys())}")
                print(f"Sample Row: {res.data[0]}")
            else:
                print("Table exists but is currently empty.")
        except Exception as e:
            print(f"\n--- TABLE: {t} --- -> Error: {e}")

if __name__ == "__main__":
    asyncio.run(inspect_supabase())
