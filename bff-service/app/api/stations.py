from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models.station import Station
from app.db.models.user import User
from app.db.models.user_station_access import UserStationAccess
from app.db.session import get_db
from app.schemas.stations import StationOut


router = APIRouter(prefix="/api/stations", tags=["stations"])


@router.get("", response_model=list[StationOut])
def list_stations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Station)
        .join(UserStationAccess, UserStationAccess.station_id == Station.id)
        .filter(UserStationAccess.user_id == current_user.id)
        .order_by(Station.station_code.asc())
        .all()
    )
