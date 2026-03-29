from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserStationAccess(Base):
    __tablename__ = "user_station_access"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="cascade"), primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id", ondelete="cascade"), primary_key=True)

    user = relationship("User", back_populates="station_access")
    station = relationship("Station", back_populates="user_access")
