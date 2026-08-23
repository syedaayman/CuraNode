import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Form
from PIL import Image

# Import schemas and services
from app.schemas.predict import SeverityResponse
from app.services.gemini_service import gemini_service
from app.services.hospital_service import hospital_service
from app.services.ambulance_service import ambulance_service

router = APIRouter()

# Define directory for saving temporary uploads
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMP_DIR = os.path.join(BASE_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

@router.post(
    "/predict",
    response_model=SeverityResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze injury and recommend top hospitals",
    description="Accepts an uploaded image file and user location, predicts injury severity, queries and ranks nearest hospitals, and returns top 3 recommended facilities."
)
async def predict_injury(
    file: UploadFile = File(...),
    latitude: float = Form(None),
    longitude: float = Form(None)
):
    """
    Endpoint that accepts an uploaded image file, validates it,
    saves it temporarily, sends it to Google Gemini for analysis,
    queries Supabase for hospitals, ranks them according to severity-aware rules,
    deletes the temp image, and returns the aggregated response.
    """
    # 1. Validate file is an image using Content-Type headers
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid image."
        )

    # 2. Validate the image is uncorrupted by opening and verifying with PIL
    try:
        # Open and check the image content
        image = Image.open(file.file)
        image.verify()
        
        # Reset file pointer back to the beginning so we can read and write it later
        await file.seek(0)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a valid or readable image structure."
        )

    # 3. Create a safe, unique filename to prevent overwriting
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    if not file_ext:
        # Fallback file extension mapping
        if "png" in file.content_type:
            file_ext = ".png"
        else:
            file_ext = ".jpg"
            
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    temp_file_path = os.path.join(TEMP_DIR, unique_filename)

    # 4. Save the file temporarily on the disk
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file temporarily: {str(e)}"
        )

    # 5. Execute Gemini prediction and Supabase ranking
    try:
        # Analyze injury image using Gemini Vision API (scale 1-10)
        analysis = await gemini_service.analyze_injury_image(temp_file_path)
        
        # Parse and validate incoming user GPS coordinates
        pat_lat = None
        pat_lon = None
        if latitude is not None:
            try:
                pat_lat = float(latitude)
                if not (-90.0 <= pat_lat <= 90.0):
                    pat_lat = None
            except (ValueError, TypeError):
                pat_lat = None

        if longitude is not None:
            try:
                pat_lon = float(longitude)
                if not (-180.0 <= pat_lon <= 180.0):
                    pat_lon = None
            except (ValueError, TypeError):
                pat_lon = None

        if pat_lat is None or pat_lon is None:
            print(f"WARNING: Invalid or missing user GPS coordinates received (latitude={latitude}, longitude={longitude}). Using reference location (13.0827, 80.2707).")
            pat_lat = pat_lat if pat_lat is not None else 13.0827
            pat_lon = pat_lon if pat_lon is not None else 80.2707
        else:
            print(f"VALIDATED: User GPS coordinates received -> Latitude: {pat_lat}, Longitude: {pat_lon}")

        ranked_hospitals = await hospital_service.get_ranked_hospitals(
            severity_score=analysis["severity_score"],
            user_lat=pat_lat,
            user_lon=pat_lon
        )
        
        # Generate and save a new incident record
        incident_id = str(uuid.uuid4())
        await ambulance_service.save_incident({
            "id": incident_id,
            "latitude": pat_lat,
            "longitude": pat_lon,
            "severity_score": analysis["severity_score"],
            "severity_level": analysis["severity_level"],
            "confidence": analysis["confidence"],
            "analysis": analysis["analysis"],
            "status": "PENDING"
        })
        
        # Prepare JSON response matching SeverityResponse schema
        return {
            "incident_id": incident_id,
            "severity_score": analysis["severity_score"],
            "severity_level": analysis["severity_level"],
            "confidence": analysis["confidence"],
            "analysis": analysis["analysis"],
            "hospitals": ranked_hospitals
        }

    finally:
        # Always clean up the temporary file from the disk to prevent disk space leaks
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception as err:
                print(f"Warning: Failed to delete temporary file {temp_file_path}: {err}")
