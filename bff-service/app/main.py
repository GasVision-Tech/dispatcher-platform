from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.events import router as events_router
from app.api.stations import router as stations_router
from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.models.station import Station
from app.db.models.user import User
from app.db.models.user_station_access import UserStationAccess
from app.db.session import SessionLocal, engine


app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(stations_router)
app.include_router(events_router)


def seed_data() -> None:
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            user_1 = User(
                email="dispatcher1@gasvision.local",
                password_hash=hash_password("demo123"),
                full_name="Иванов И.",
                telegram_username="@ivanov_dispatch",
            )
            user_2 = User(
                email="dispatcher2@gasvision.local",
                password_hash=hash_password("demo123"),
                full_name="Петров П.",
                telegram_username=None,
            )

            station_1 = Station(station_code="azs_001", name="АЗС #101", location="Казань, пр-т Победы", status="online")
            station_2 = Station(station_code="azs_002", name="АЗС #102", location="Казань, ул. Чистопольская", status="warn")
            station_3 = Station(station_code="azs_003", name="АЗС #103", location="Казань, Оренбургский тракт", status="online")
            station_4 = Station(station_code="azs_004", name="АЗС #104", location="Казань, ул. Декабристов", status="offline")

            db.add_all([user_1, user_2, station_1, station_2, station_3, station_4])
            db.flush()

            db.add_all(
                [
                    UserStationAccess(user_id=user_1.id, station_id=station_1.id),
                    UserStationAccess(user_id=user_1.id, station_id=station_2.id),
                    UserStationAccess(user_id=user_1.id, station_id=station_3.id),
                    UserStationAccess(user_id=user_2.id, station_id=station_2.id),
                    UserStationAccess(user_id=user_2.id, station_id=station_4.id),
                ]
            )
            db.commit()
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    seed_data()


@app.get("/health")
def health():
    return {"status": "ok"}
