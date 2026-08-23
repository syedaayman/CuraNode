from pydantic import BaseModel, Field

class HospitalResponse(BaseModel):
    id: str = Field(..., description="Unique UUID of the hospital/clinic")
    name: str = Field(..., description="Name of the healthcare facility")
    address: str = Field(..., description="Street address of the facility")
    city: str = Field(..., description="City location")
    state: str = Field(..., description="State location")
    pincode: str = Field(..., description="Pincode value")
    latitude: float = Field(..., description="Latitude coordinate")
    longitude: float = Field(..., description="Longitude coordinate")
    has_icu: bool = Field(..., description="Whether ICU facilities are available")
    has_trauma_care: bool = Field(..., description="Whether trauma care facilities are available")
    has_emergency: bool = Field(..., description="Whether emergency rooms are available")
    distance: float = Field(..., description="Distance in kilometers from user location")
    estimated_travel_time: int = Field(..., description="Estimated travel time in minutes")

class SeverityResponse(BaseModel):
    incident_id: str = Field(
        ...,
        description="Unique UUID generated for this emergency incident report"
    )
    severity_score: int = Field(
        ...,
        description="Severity score of the injury on a scale of 1 to 10 (1-3 Low, 4-6 Medium, 7-8 High, 9-10 Critical)."
    )
    severity_level: str = Field(
        ...,
        description="Severity level classification. Must be exactly one of: Low, Medium, High, Critical"
    )
    confidence: float = Field(
        ...,
        description="Confidence score of the prediction, a float between 0.0 and 1.0 (e.g., 0.95)"
    )
    analysis: str = Field(
        ...,
        description="Detailed clinical triage analysis explaining the visual findings and reasoning behind this severity rating."
    )
    hospitals: list[HospitalResponse] = Field(
        ...,
        description="Top 3 recommended healthcare facilities matching severity requirements and proximity."
    )

class InjuryAnalysis(BaseModel):
    severity_score: int = Field(
        ...,
        description="Severity score of the injury on a scale of 1 to 10 (1-3 Low, 4-6 Medium, 7-8 High, 9-10 Critical)."
    )
    severity_level: str = Field(
        ...,
        description="Severity level classification. Must be exactly one of: Low, Medium, High, Critical"
    )
    confidence: float = Field(
        ...,
        description="Confidence score of the prediction, a float between 0.0 and 1.0 (e.g., 0.95)"
    )
    analysis: str = Field(
        ...,
        description="Detailed clinical triage analysis explaining the visual findings and reasoning behind this severity rating."
    )
