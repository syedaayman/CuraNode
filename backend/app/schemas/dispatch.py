from pydantic import BaseModel, Field
from typing import List, Optional

class AmbulanceProviderSchema(BaseModel):
    id: str = Field(..., description="Unique UUID of the ambulance provider")
    name: str = Field(..., description="Name of the provider (e.g. Apollo Ambulance Provider)")
    type: str = Field(..., description="Provider type (HOSPITAL, GOVERNMENT, PRIVATE)")
    hospital_id: Optional[str] = Field(None, description="UUID of the hospital if type is HOSPITAL")

class AmbulanceSchema(BaseModel):
    id: str = Field(..., description="Unique ID of the ambulance")
    number: str = Field(..., description="Ambulance number identifier (e.g. AMB-204)")
    status: str = Field(..., description="Current status of the ambulance (AVAILABLE, DISPATCHED, AT_PATIENT, TRANSPORTING)")
    latitude: float = Field(..., description="Current latitude coordinate")
    longitude: float = Field(..., description="Current longitude coordinate")
    provider_id: Optional[str] = Field(None, description="UUID of the ambulance provider, if any")
    assigned_hospital: Optional[str] = Field(None, description="ID of the destination hospital assigned, if any")
    assigned_incident: Optional[str] = Field(None, description="UUID of the incident assigned, if any")
    speed: float = Field(40.0, description="Average speed in km/h")
    eta: Optional[str] = Field(None, description="Estimated time of arrival to target (e.g. 5 mins)")

class DispatchReq(BaseModel):
    incident_id: str = Field(..., description="UUID of the incident to dispatch an ambulance to")
    hospital_id: str = Field(..., description="ID of the hospital destination for transport")

class DispatchResp(BaseModel):
    ambulance: AmbulanceSchema = Field(..., description="The assigned ambulance details")
    eta: str = Field(..., description="Estimated travel time to the patient")
    distance: float = Field(..., description="Driving distance to the patient in kilometers")
    route: List[List[float]] = Field(..., description="Array of [lat, lon] tuples representing the route path")

class DispatchSchema(BaseModel):
    id: str = Field(..., description="Unique UUID of the dispatch record")
    ambulance_id: str = Field(..., description="ID of the dispatched ambulance")
    incident_id: str = Field(..., description="UUID of the incident")
    hospital_id: str = Field(..., description="UUID of the destination hospital")
    dispatch_time: str = Field(..., description="ISO timestamp of when the dispatch was initiated")
    completed_time: Optional[str] = Field(None, description="ISO timestamp of when the dispatch was completed")
    status: str = Field(..., description="Current status of the dispatch (DISPATCHED, COMPLETED)")

class HospitalRequestReq(BaseModel):
    incident_id: str = Field(..., description="UUID of the incident")
    hospital_id: str = Field(..., description="UUID of the hospital selected")
    hospital_name: Optional[str] = Field(None, description="Name of the selected hospital")

class AcceptEmergencyReq(BaseModel):
    incident_id: str = Field(..., description="UUID of the incident")
    hospital_id: str = Field(..., description="UUID of the hospital destination")
    dispatch_log_id: str = Field(..., description="UUID of the dispatch log request to accept")

class RejectEmergencyReq(BaseModel):
    incident_id: str = Field(..., description="UUID of the incident")
    hospital_id: str = Field(..., description="UUID of the hospital destination")
    dispatch_log_id: str = Field(..., description="UUID of the dispatch log request to reject")

class CancelEmergencyReq(BaseModel):
    incident_id: str = Field(..., description="UUID of the incident to cancel")


