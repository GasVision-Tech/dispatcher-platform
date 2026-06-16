from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models.station import Station
from app.db.models.user import User
from app.db.models.user_station_access import UserStationAccess
from app.db.session import get_db
from app.schemas.events import DashboardSummary, EventDetail, EventListItem, EventStatusPatch
from app.services.event_service import event_service_client


router = APIRouter(tags=["events"])


def _station_map_for_user(db: Session, user_id: int) -> dict[str, Station]:
    stations = (
        db.query(Station)
        .join(UserStationAccess, UserStationAccess.station_id == Station.id)
        .filter(UserStationAccess.user_id == user_id)
        .all()
    )
    return {station.station_code: station for station in stations}


def _user_map_for_events(db: Session, events: list[dict]) -> dict[int, User]:
    user_ids = {
        event.get("user_id_who_changed_status")
        for event in events
        if event.get("user_id_who_changed_status") is not None
    }
    if not user_ids:
        return {}

    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return {user.id: user for user in users}


# def _adapt_event(event: dict, station_map: dict[str, Station], user_map: dict[int, User]) -> EventListItem:
#     station = station_map.get(event["station_code"])
#     user_id_who_changed_status = event.get("user_id_who_changed_status")
#     last_status_changed_by_name = None
#     if user_id_who_changed_status is not None:
#         user = user_map.get(user_id_who_changed_status)
#         last_status_changed_by_name = user.full_name if user else f"User #{user_id_who_changed_status}"
#     preview_image_url = None
#     clip_url = None
#     media = event.get("media", [])
#     for item in media:
#         if item["kind"] == "image" and preview_image_url is None:
#             preview_image_url = item["s3_url"]
#         if item["kind"] == "clip" and clip_url is None:
#             clip_url = item["s3_url"]

#     return EventListItem(
#         id=event["id"],
#         source=event["source"],
#         title=event["title"],
#         station_code=event["station_code"],
#         station_name=station.name if station else event["station_code"],
#         camera_code=event.get("camera_code"),
#         severity=event["severity"],
#         status=event["status"],
#         created_at=event["created_at"],
#         updated_at=event["updated_at"],
#         preview_image_url=preview_image_url,
#         clip_url=clip_url,
#         last_status_changed_by_name=last_status_changed_by_name,
#     )


def _adapt_event(event: dict, station_map: dict[str, Station], user_map: dict[int, User]) -> EventListItem:
    station = station_map.get(event["station_code"])
    user_id_who_changed_status = event.get("user_id_who_changed_status")
    last_status_changed_by_name = None
    if user_id_who_changed_status is not None:
        user = user_map.get(user_id_who_changed_status)
        last_status_changed_by_name = user.full_name if user else f"User #{user_id_who_changed_status}"

    preview_image_url = None
    clip_url = None
    for item in event.get("media", []):
        if item["kind"] == "image" and preview_image_url is None:
            preview_image_url = item["s3_url"]
        if item["kind"] == "clip" and clip_url is None:
            clip_url = item["s3_url"]

    return EventListItem(
        id=event["id"],
        source=event["source"],
        title=event["title"],
        station_code=event["station_code"],
        station_name=station.name if station else event["station_code"],
        camera_code=event.get("camera_code"),
        severity=event["severity"],
        status=event["status"],
        created_at=event["created_at"],
        updated_at=event["updated_at"],
        preview_image_url=preview_image_url,
        clip_url=clip_url,
        last_status_changed_by_name=last_status_changed_by_name,
    )


@router.get("/api/events", response_model=list[EventListItem])
async def list_events(
    source: str | None = None,
    status: str | None = None,
    severity: str | None = None,
    station_code: str | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    station_map = _station_map_for_user(db, current_user.id)
    allowed_station_codes = list(station_map.keys())
    if station_code and station_code in station_map:
        allowed_station_codes = [station_code]

    raw_events = await event_service_client.list_events(
        station_codes=allowed_station_codes,
        status=status,
        severity=severity,
        limit=1000,
        offset=0,
    )

    user_map = _user_map_for_events(db, raw_events)
    items = [_adapt_event(event, station_map, user_map) for event in raw_events]
    if source:
        items = [item for item in items if item.source == source]
    if search:
        query = search.lower()
        items = [
            item for item in items
            if query in f"{item.id} {item.title} {item.station_name} {item.station_code}".lower()
        ]
    return items


# @router.get("/api/events/{event_id}", response_model=EventDetail)
# async def get_event(
#     event_id: int,
#     current_user: User = Depends(get_current_user),
#     db: Session = Depends(get_db),
# ):
#     station_map = _station_map_for_user(db, current_user.id)
#     event = await event_service_client.get_event(event_id)
#     if event["station_code"] not in station_map:
#         raise HTTPException(status_code=404, detail="event not found")

#     user_map = _user_map_for_events(db, [event])
#     base = _adapt_event(event, station_map, user_map)
#     return EventDetail(**base.model_dump(), media=event.get("media", []))

@router.get("/api/events/{event_id}", response_model=EventDetail)
async def get_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    station_map = _station_map_for_user(db, current_user.id)
    event = await event_service_client.get_event(event_id)
    if event["station_code"] not in station_map:
        raise HTTPException(status_code=404, detail="event not found")

    user_map = _user_map_for_events(db, [event])
    base = _adapt_event(event, station_map, user_map)
    return EventDetail(**base.model_dump(), media=event.get("media", []))


@router.patch("/api/events/{event_id}/status", response_model=EventDetail)
async def patch_event_status(
    event_id: int,
    payload: EventStatusPatch,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    station_map = _station_map_for_user(db, current_user.id)
    existing = await event_service_client.get_event(event_id)
    if existing["station_code"] not in station_map:
        raise HTTPException(status_code=404, detail="event not found")

    patched = await event_service_client.patch_event(
        event_id,
        {
            "status": payload.status,
            "user_id_who_changed_status": current_user.id,
        },
    )
    user_map = _user_map_for_events(db, [patched])
    base = _adapt_event(patched, station_map, user_map)
    return EventDetail(**base.model_dump(), media=patched.get("media", []))


@router.get("/api/dashboard/summary", response_model=DashboardSummary)
async def dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    station_map = _station_map_for_user(db, current_user.id)
    events = await event_service_client.list_events(station_codes=station_map.keys(), limit=200, offset=0)
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)

    recent = [
        event for event in events
        if datetime.fromisoformat(event["created_at"].replace("Z", "+00:00")) >= last_24h
    ]

    return DashboardSummary(
        events_24h=len(recent),
        cv_24h=len([event for event in recent if event["source"] == "cv"]),
        ai_24h=len([event for event in recent if event["source"] == "ai"]),
        high_24h=len([event for event in recent if event["severity"] == "high"]),
        stations_total=len(station_map),
    )
