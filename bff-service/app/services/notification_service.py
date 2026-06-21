from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.notification_delivery import NotificationDelivery
from app.services.dispatcher_recipients import get_dispatcher_emails_for_station
from app.services.email_sender import EmailSender
from app.services.notification_rules import should_send_dispatcher_email
from app.services.notification_templates import build_dispatcher_email


def notify_dispatchers_about_event(event: dict, db: Session) -> None:
    if not should_send_dispatcher_email(event, db):
        return

    delivery = (
        db.query(NotificationDelivery)
        .filter(
            NotificationDelivery.event_id == event["id"],
            NotificationDelivery.channel == "email",
        )
        .one_or_none()
    )
    if delivery is None:
        delivery = NotificationDelivery(
            event_id=event["id"],
            channel="email",
            status="pending",
            severity=event.get("severity"),
            station_code=event.get("station_code"),
            camera_code=event.get("camera_code"),
            title=event.get("title"),
        )
        db.add(delivery)
    else:
        delivery.status = "pending"
        delivery.severity = event.get("severity")
        delivery.station_code = event.get("station_code")
        delivery.camera_code = event.get("camera_code")
        delivery.title = event.get("title")
        delivery.error = None

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return

    recipients = get_dispatcher_emails_for_station(db, event["station_code"])
    if not recipients:
        delivery.status = "skipped"
        delivery.error = f"no active dispatcher emails for station {event['station_code']}"
        db.commit()
        return

    subject, text_body, html_body = build_dispatcher_email(event)
    try:
        EmailSender().send(
            recipients=recipients,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )
    except Exception as exc:
        delivery.status = "failed"
        delivery.error = str(exc)
        db.commit()
        return

    delivery.status = "sent"
    delivery.sent_at = datetime.now(timezone.utc)
    delivery.error = None
    db.commit()
