import os
import asyncio
from PIL import Image
from google import genai
from google.genai import types
from fastapi import HTTPException, status

# Import modular response schema
from app.schemas.predict import InjuryAnalysis

class GeminiService:
    def __init__(self):
        self._client = None

    def _get_client(self) -> genai.Client:
        """
        Lazily initialize the Gemini client so it gets the key after environment variables are loaded.
        """
        if self._client is not None:
            return self._client

        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Gemini API Key is missing. Please configure GEMINI_API_KEY in your .env file."
            )

        try:
            self._client = genai.Client(api_key=gemini_api_key)
            return self._client
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to initialize Google Gen AI Client: {str(e)}"
            )

    async def analyze_injury_image(self, image_path: str) -> dict:
        """
        Analyze the injury image using Gemini Vision API with structured JSON output
        conforming to the InjuryAnalysis schema (severity score 1-10).
        """
        if not os.path.exists(image_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image not found at path: {image_path}"
            )

        client = self._get_client()

        try:
            image = Image.open(image_path)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read image file: {str(e)}"
            )

        prompt = (
            "You are a professional emergency medical triage AI assistant. "
            "Analyze the uploaded accident/injury image and determine the clinical urgency. "
            "Determine the severity score on a scale of 1 to 10 matching these tiers:\n"
            "- 1 to 3: Low Severity (minor cuts, small wounds, minor burns, abrasions)\n"
            "- 4 to 6: Medium Severity\n"
            "- 7 to 8: High Severity\n"
            "- 9 to 10: Critical Severity\n"
            "Determine the severity level (exactly one of: Low, Medium, High, Critical),\n"
            "provide a confidence score (from 0.0 to 1.0), and write a concise medical triage "
            "explanation for your choice. Return ONLY a valid JSON matching the schema."
        )

        response = None
        last_error = None

        for attempt in range(1, 4):
            try:
                response = client.models.generate_content(
                    model="gemini-3.5-flash-lite",
                    contents=[image, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=InjuryAnalysis,
                        temperature=0.1,
                    ),
                )
                if response and response.text:
                    break
            except Exception as req_err:
                last_error = req_err
                print(f"[GEMINI API] Attempt {attempt}/3 failed: {req_err}")
                if attempt < 3:
                    await asyncio.sleep(1)

        if not response or not response.text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini API analysis failed: {str(last_error) if last_error else 'Empty response from Gemini API'}"
            )

        try:
            result = InjuryAnalysis.model_validate_json(response.text)
            
            severity_level = result.severity_level.strip().capitalize()
            valid_levels = {"Low", "Medium", "High", "Critical"}
            if severity_level not in valid_levels:
                if result.severity_score >= 9:
                    severity_level = "Critical"
                elif result.severity_score >= 7:
                    severity_level = "High"
                elif result.severity_score >= 4:
                    severity_level = "Medium"
                else:
                    severity_level = "Low"

            severity_score = max(1, min(10, result.severity_score))

            return {
                "severity_score": severity_score,
                "severity_level": severity_level,
                "confidence": round(result.confidence, 2),
                "analysis": result.analysis
            }
        except Exception as parse_err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to parse Gemini API JSON response: {str(parse_err)}"
            )

gemini_service = GeminiService()
