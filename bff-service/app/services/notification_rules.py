from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models.notification_delivery import NotificationDelivery


def should_send_dispatcher_email(event: dict, db: Session) -> bool:
    if not settings.mail_enabled:
        return False

    severity = event.get("severity")
    if severity == "low":
        return False

    existing_delivery = db.execute(
        select(NotificationDelivery).where(
            NotificationDelivery.event_id == event["id"],
            NotificationDelivery.channel == "email",
            NotificationDelivery.status.in_(("pending", "sent")),
        )
    ).scalar_one_or_none()
    if existing_delivery:
        return False

    if severity == "high":
        return True

    if severity == "med":
        cooldown_from = datetime.now(timezone.utc) - timedelta(
            minutes=settings.notification_med_cooldown_minutes
        )
        recent_similar_email = db.execute(
            select(NotificationDelivery).where(
                NotificationDelivery.channel == "email",
                NotificationDelivery.status == "sent",
                NotificationDelivery.sent_at >= cooldown_from,
                NotificationDelivery.severity == "med",
                NotificationDelivery.station_code == event["station_code"],
                NotificationDelivery.camera_code == event.get("camera_code"),
                NotificationDelivery.title == event["title"],
            )
        ).scalar_one_or_none()

        return recent_similar_email is None

    return False
