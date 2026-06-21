from datetime import datetime, timezone
from html import escape
from zoneinfo import ZoneInfo

from app.core.config import settings


def build_dispatcher_email(event: dict) -> tuple[str, str, str]:
    severity = event["severity"].upper()
    subject = f"[{severity}] {settings.mail_subject_prefix}: событие на {event['station_code']}"
    if event.get("camera_code"):
        subject = f"{subject}, камера {event['camera_code']}"

    event_url = _event_url(event["id"])
    media_lines = _media_lines(event)
    created_at_moscow = _format_moscow_time(event.get("created_at"))

    text_body = "\n".join(
        line
        for line in [
            "Обнаружено событие GasVision",
            "",
            f"Приоритет: {severity}",
            f"Станция: {event['station_code']}",
            f"Камера: {event.get('camera_code') or '-'}",
            f"Источник: {event['source'].upper()}",
            f"Время: {created_at_moscow}",
            f"Событие: {event['title']}",
            "",
            "Материалы:",
            *media_lines,
            "",
            f"Открыть событие: {event_url}" if event_url else None,
        ]
        if line is not None
    )

    image_preview = _first_media_url(event, "image")
    html_body = f"""\
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #172026; line-height: 1.45;">
    <h2 style="margin: 0 0 12px;">Обнаружено событие GasVision</h2>
    <p style="margin: 0 0 16px;">
      <strong style="background: {_severity_color(event['severity'])}; color: #fff; padding: 4px 8px; border-radius: 4px;">{escape(severity)}</strong>
    </p>
    <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
      <tr><td><strong>Станция</strong></td><td>{escape(event['station_code'])}</td></tr>
      <tr><td><strong>Камера</strong></td><td>{escape(event.get('camera_code') or "-")}</td></tr>
      <tr><td><strong>Источник</strong></td><td>{escape(event['source'].upper())}</td></tr>
      <tr><td><strong>Время</strong></td><td>{escape(created_at_moscow)}</td></tr>
      <tr><td><strong>Событие</strong></td><td>{escape(event['title'])}</td></tr>
    </table>
    {_html_preview(image_preview)}
    {_html_media(event)}
    {_html_event_link(event_url)}
  </body>
</html>
"""

    return subject, text_body, html_body


def _event_url(event_id: int) -> str | None:
    if not settings.dispatcher_event_base_url:
        return None

    return f"{settings.dispatcher_event_base_url.rstrip('/')}/{event_id}"


def _media_lines(event: dict) -> list[str]:
    media = event.get("media") or []
    if not media:
        return ["- нет"]

    return [f"- {item['kind']}: {item['s3_url']}" for item in media]


def _first_media_url(event: dict, kind: str) -> str | None:
    for item in event.get("media") or []:
        if item["kind"] == kind:
            return item["s3_url"]
    return None


def _html_preview(image_url: str | None) -> str:
    if not image_url:
        return ""

    return f'<p style="margin: 18px 0;"><img src="{escape(image_url)}" alt="Кадр события" style="max-width: 640px; width: 100%; height: auto; border-radius: 6px;"></p>'


def _html_media(event: dict) -> str:
    media = event.get("media") or []
    if not media:
        return "<p><strong>Материалы:</strong> нет</p>"

    links = "".join(
        f'<li><a href="{escape(item["s3_url"])}">{escape(item["kind"])}</a></li>'
        for item in media
    )
    return f"<p><strong>Материалы:</strong></p><ul>{links}</ul>"


def _html_event_link(event_url: str | None) -> str:
    if not event_url:
        return ""

    return f'<p style="margin-top: 18px;"><a href="{escape(event_url)}" style="background: #0b6bcb; color: #fff; padding: 10px 14px; text-decoration: none; border-radius: 4px;">Открыть событие</a></p>'


def _format_moscow_time(value: object) -> str:
    if value is None:
        return "-"
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(ZoneInfo("Europe/Moscow")).strftime("%Y-%m-%d %H:%M:%S")


def _severity_color(severity: str) -> str:
    return {
        "high": "#b42318",
        "med": "#b54708",
        "low": "#475467",
    }.get(severity, "#475467")
