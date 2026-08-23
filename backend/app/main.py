import os
import logging
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables (checking curanode/.env first, then userSide/.env, then local .env)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CURANODE_ENV = os.path.join(PROJECT_ROOT, "curanode", ".env")
USER_SIDE_ENV = os.path.join(PROJECT_ROOT, "userSide", ".env")

if os.path.exists(CURANODE_ENV):
    logger.info(f"Loading environment from {CURANODE_ENV}")
    load_dotenv(CURANODE_ENV, override=True)
elif os.path.exists(USER_SIDE_ENV):
    logger.info(f"Loading environment from {USER_SIDE_ENV}")
    load_dotenv(USER_SIDE_ENV, override=True)
load_dotenv()  # Local directory fallback

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.api.predict import router as predict_router
from app.api.dispatch import router as dispatch_router
from app.services.websocket_manager import websocket_manager
from app.services.ambulance_service import ambulance_service
from app.services.dispatch_service import dispatch_service
from typing import List, Dict
import json
import asyncio
import random

app = FastAPI(
    title="Curanode Emergency AI Triage API",
    description="FastAPI backend to receive medical images, perform validation, save files temporarily, and serve prediction details.",
    version="1.0.0"
)

# Unhandled exception handler
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )
    logger.error(f"Unhandled exception during {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )

# CORS configurations
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
    "https://curanode-userside-deploy.vercel.app",
    "https://curanode.vercel.app",
]

# Read optional environment variable CORS_ORIGINS or ALLOWED_ORIGINS (comma-separated)
env_origins = os.getenv("CORS_ORIGINS") or os.getenv("ALLOWED_ORIGINS")
if env_origins:
    for o in env_origins.split(","):
        o_clean = o.strip()
        if o_clean and o_clean not in origins:
            origins.append(o_clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*onrender\.com|curanode.*)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Register routers
app.include_router(predict_router)
app.include_router(dispatch_router)

# Start background simulation task on startup
@app.on_event("startup")
async def startup_event():
    # Sync and seed default ambulances in database/memory cache
    await ambulance_service.initialize_ambulances()
    # Resume any active escalation monitors from the database
    await dispatch_service.resume_active_monitors()

@app.websocket("/ws/ambulances")
async def websocket_ambulances(websocket: WebSocket):
    """WebSocket endpoint for real-time ambulance location updates"""
    await websocket_manager.connect(websocket)
    try:
        # Send initial ambulance data from state registry
        ambulances = await ambulance_service.get_all_ambulances()
        initial_data = {
            "type": "ambulance_update",
            "ambulances": ambulances
        }
        await websocket.send_text(json.dumps(initial_data))

        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Ambulance WebSocket client disconnected")
    except Exception as e:
        logger.error(f"Ambulance WebSocket error: {e}", exc_info=True)
    finally:
        websocket_manager.disconnect(websocket)

@app.get("/")
def read_root():
    """
    Root endpoint to verify the server status.
    """
    return {
        "status": "online",
        "service": "Curanode AI API",
        "docs_path": "/docs"
    }
