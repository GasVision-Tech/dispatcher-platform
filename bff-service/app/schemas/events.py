from datetime import datetime

from pydantic import BaseModel


class EventMediaOut(BaseModel):
    id: int | None = None
    kind: str
    s3_url: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class EventListItem(BaseModel):
    id: int
    source: str
    title: str
    station_code: str
    station_name: str
    camera_code: str | None
    severity: str
    status: str
    created_at: datetime
    updated_at: datetime
    preview_image_url: str | None
    clip_url: str | None


class EventDetail(EventListItem):
    media: list[EventMediaOut]


class EventStatusPatch(BaseModel):
    status: str


class DashboardSummary(BaseModel):
    events_24h: int
    cv_24h: int
    ai_24h: int
    high_24h: int
    stations_total: int
