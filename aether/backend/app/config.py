from __future__ import annotations
from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from dotenv import load_dotenv

# Forcibly load local .env variables to override any system-wide environment variables
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(env_path, override=True)


class Settings(BaseSettings):
    app_env: str = "development"
    app_port: int = 8000
    database_url: str = "sqlite:///./aether.db"
    allowed_origins: str = "http://localhost:3000"
    cpcb_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    default_city: str = "Kolkata"
    sql_echo: bool = False

    # Twilio SMS Config
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    twilio_to_number: str = ""

    # Admin security key — set ADMIN_KEY env var on Render
    admin_key: str = "supersecretkey"

    # CPCB API (legacy — superseded by WAQI)
    cpcb_resource_id: str = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
    cpcb_api_base: str = "https://api.data.gov.in/resource"

    # WAQI (World Air Quality Index) — real CPCB data, free token at https://aqicn.org/api/
    waqi_token: str = ""

    # Open-Meteo
    open_meteo_base: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_airquality_base: str = "https://air-quality-api.open-meteo.com/v1/air-quality"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **values):
        super().__init__(**values)
        for placeholder_field in ["cpcb_api_key", "openai_api_key", "twilio_account_sid", "twilio_auth_token", "waqi_token"]:
            val = getattr(self, placeholder_field, "")
            if val and ("your_" in val or val in ("YOUR_TOKEN", "changeme")):
                setattr(self, placeholder_field, "")


@lru_cache()
def get_settings() -> Settings:
    return Settings()
