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


settings = Settings()
