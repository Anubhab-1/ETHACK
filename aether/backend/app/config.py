from __future__ import annotations
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_env: str = "development"
    app_port: int = 8000
    database_url: str = "sqlite:///./aether.db"
    allowed_origins: str = "http://localhost:3000"
    cpcb_api_key: str = ""
    openai_api_key: str = ""
    default_city: str = "Kolkata"

    # CPCB API
    cpcb_resource_id: str = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
    cpcb_api_base: str = "https://api.data.gov.in/resource"

    # Open-Meteo
    open_meteo_base: str = "https://api.open-meteo.com/v1/forecast"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **values):
        super().__init__(**values)
        if "your_" in self.cpcb_api_key:
            self.cpcb_api_key = ""
        if "your_" in self.openai_api_key:
            self.openai_api_key = ""


@lru_cache()
def get_settings() -> Settings:
    return Settings()
