from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models.station import Station
from app.db.models.user import User
from app.db.models.user_station_access import UserStationAccess


def get_dispatcher_emails_for_station(db: Session, station_code: str) -> list[str]:
    normalized_station_code = _normalize_station_code(station_code)
    rows = (
        db.query(User.email)
        .join(UserStationAccess, UserStationAccess.user_id == User.id)
        .join(Station, Station.id == UserStationAccess.station_id)
        .filter(
            func.replace(func.lower(Station.station_code), "-", "_") == normalized_station_code,
            User.is_active.is_(True),
        )
        .order_by(User.email.asc())
        .distinct()
        .all()
    )

    return [row.email for row in rows if row.email]


def _normalize_station_code(station_code: str) -> str:
    return station_code.lower().replace("-", "_")
