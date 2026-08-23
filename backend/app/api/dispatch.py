import logging
from fastapi import APIRouter, status
from app.schemas.dispatch import DispatchReq, DispatchResp, HospitalRequestReq, AcceptEmergencyReq, RejectEmergencyReq, CancelEmergencyReq
from app.services.dispatch_service import dispatch_service
from app.services.ambulance_service import ambulance_service
from app.services.websocket_manager import websocket_manager
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post(
    "/dispatch",
    response_model=DispatchResp,
    status_code=status.HTTP_200_OK,
    summary="Dispatch nearest available ambulance to patient",
    description="Finds the nearest available ambulance, locks it to the incident/hospital, builds the initial route, and starts real-time movement tracking."
)
async def dispatch_ambulance(payload: DispatchReq):
    """
    Endpoint to trigger ambulance dispatch for a specific emergency case.
    """
    dispatch_details = await dispatch_service.dispatch_ambulance(
        incident_id=payload.incident_id,
        hospital_id=payload.hospital_id
    )
    return dispatch_details

@router.post(
    "/api/request-hospital",
    status_code=status.HTTP_200_OK,
    summary="Request emergency hospital selection and insert dispatch log"
)
async def request_hospital(payload: HospitalRequestReq):
    """
    Endpoint to process emergency hospital selection, update incidents,
    insert a REQUESTED dispatch log, and emit a hospital_request_created WebSocket notification.
    """
    hospital_name = payload.hospital_name
    if not hospital_name:
        h_details = await dispatch_service.get_hospital_details(payload.hospital_id)
        hospital_name = h_details.get("name", "Recommended Care Center")

    result = await ambulance_service.request_hospital(
        incident_id=payload.incident_id,
        hospital_id=payload.hospital_id,
        hospital_name=hospital_name
    )

    # Fetch incident metadata for dashboard notification payload
    incident = await ambulance_service.get_incident(payload.incident_id)
    severity = incident.get("severity_level", "Medium") if incident else "Medium"
    patient_location = {
        "latitude": float(incident.get("latitude")) if incident and incident.get("latitude") is not None else 0.0,
        "longitude": float(incident.get("longitude")) if incident and incident.get("longitude") is not None else 0.0
    }
    ai_summary = incident.get("analysis", "") if incident else ""

    # Emit WebSocket event with full diagnostic details for the Hospital Dashboard
    event_payload = {
        "type": "hospital_request_created",
        "incident_id": payload.incident_id,
        "hospital_id": payload.hospital_id,
        "dispatch_log_id": result.get("dispatch_log_id"),
        "severity": severity,
        "patient_location": patient_location,
        "ai_summary": ai_summary,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dispatch_status": "REQUESTED",
        "incident_status": "PENDING_HOSPITAL_ACCEPTANCE"
    }
    await websocket_manager.broadcast(event_payload)

    # Start the escalation timeout monitor
    # Fetch ranked hospital candidates for escalation fallback
    try:
        patient_lat = patient_location.get("latitude", 0.0)
        patient_lon = patient_location.get("longitude", 0.0)
        severity_score = incident.get("severity_score", 5) if incident else 5
        from app.services.hospital_service import hospital_service as hs
        candidate_hospitals = await hs.get_ranked_hospitals(severity_score, patient_lat, patient_lon)
    except Exception as e:
        logger.warning(f"Failed to fetch ranked hospitals for escalation candidates: {e}")
        candidate_hospitals = []

    dispatch_service.start_escalation_monitor(
        incident_id=payload.incident_id,
        hospital_id=payload.hospital_id,
        dispatch_log_id=result.get("dispatch_log_id"),
        candidate_hospitals=candidate_hospitals
    )

    return result

@router.post(
    "/api/accept-emergency",
    status_code=status.HTTP_200_OK,
    summary="Accept emergency request and initiate ambulance dispatch"
)
async def accept_emergency(payload: AcceptEmergencyReq):
    """
    Endpoint for hospital to accept an emergency request, update status, and continue ambulance dispatch.
    """
    now_str = datetime.now(timezone.utc).isoformat()

    # 1. Update the database / cache statuses to ACCEPTED / HOSPITAL_ACCEPTED
    await ambulance_service.update_dispatch(payload.dispatch_log_id, {
        "dispatch_status": "ACCEPTED",
        "accepted_at": now_str,
        "updated_at": now_str
    })
    await ambulance_service.update_incident(payload.incident_id, {
        "incident_status": "HOSPITAL_ACCEPTED",
        "status": "PENDING",
        "updated_at": now_str
    })

    # Broadcast WebSocket accept notification
    accept_payload = {
        "type": "hospital_request_accepted",
        "incident_id": payload.incident_id,
        "hospital_id": payload.hospital_id,
        "dispatch_log_id": payload.dispatch_log_id,
        "dispatch_status": "ACCEPTED",
        "incident_status": "HOSPITAL_ACCEPTED"
    }
    await websocket_manager.broadcast(accept_payload)

    # 2. Continue ambulance assignment workflow
    dispatch_details = await dispatch_service.dispatch_ambulance(
        incident_id=payload.incident_id,
        hospital_id=payload.hospital_id,
        dispatch_log_id=payload.dispatch_log_id
    )
    return dispatch_details

@router.post(
    "/api/reject-emergency",
    status_code=status.HTTP_200_OK,
    summary="Reject emergency request and escalate to next hospital"
)
async def reject_emergency(payload: RejectEmergencyReq):
    """
    Endpoint for hospital to explicitly reject emergency request, initiating escalation.
    """
    return await dispatch_service.reject_hospital(
        incident_id=payload.incident_id,
        hospital_id=payload.hospital_id,
        dispatch_log_id=payload.dispatch_log_id
    )

@router.post(
    "/api/cancel-emergency",
    status_code=status.HTTP_200_OK,
    summary="Cancel active emergency request"
)
async def cancel_emergency(payload: CancelEmergencyReq):
    """
    Endpoint for user to cancel an emergency request.
    """
    return await dispatch_service.cancel_emergency(incident_id=payload.incident_id)

@router.get(
    "/api/incident/{incident_id}/status",
    status_code=status.HTTP_200_OK,
    summary="Get full incident and request status for page refresh recovery"
)
async def get_incident_status(incident_id: str):
    """
    Endpoint to retrieve current persistent incident and dispatch log state for client recovery.
    """
    return await dispatch_service.get_incident_status_summary(incident_id)

