import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings


class EmailConfigurationError(RuntimeError):
    pass


class EmailSender:
    def send(
        self,
        *,
        recipients: list[str],
        subject: str,
        text_body: str,
        html_body: str | None = None,
    ) -> None:
        if not settings.mail_from:
            raise EmailConfigurationError("mail_from must be configured")
        if not recipients:
            raise EmailConfigurationError("recipients must not be empty")
        if not settings.smtp_host:
            raise EmailConfigurationError("smtp_host must be configured")

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((settings.mail_subject_prefix, settings.mail_from))
        message["To"] = ", ".join(recipients)
        message.set_content(text_body)

        if html_body:
            message.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
