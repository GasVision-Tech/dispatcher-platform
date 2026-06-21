from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "GasVision BFF"
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    event_service_base_url: str
    cors_origins: str
    seed_demo_data: bool = False
    demo_dispatcher_email: str | None = None
    demo_dispatcher_password: str | None = None

    mail_enabled: bool = False
    mail_from: str | None = None
    mail_subject_prefix: str = "GasVision"
    dispatcher_event_base_url: str | None = None

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True

    notification_med_cooldown_minutes: int = 10


settings = Settings()
