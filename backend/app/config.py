"""Application settings, read from environment variables (and an optional .env file)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.environ.get("ENV_FILE", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- General -----------------------------------------------------------
    app_name: str = "MyAudioBook"
    public_url: str = "http://localhost:8000"
    data_dir: Path = Path("./data")
    models_dir: Path | None = None  # defaults to <data_dir>/models
    github_url: str = "https://github.com/Lomchat/my-audio-book"

    extra_origins: str = ""  # other public origins serving this app (e.g. a Cloudflare Worker), comma-separated

    # --- Google sign-in (optional) -----------------------------------------
    google_client_id: str = ""
    google_client_secret: str = ""

    # --- Accounts & limits ------------------------------------------------
    allow_signup: bool = True
    free_quota_minutes: float = 5  # minutes of audio per account (lifetime); -1 = unlimited
    contact_url: str = ""  # shown when the quota is reached (e.g. https://wa.me/...)
    max_upload_mb: int = 100
    max_audio_minutes: int = 180
    ai_daily_limit: int = 50  # chat messages + re-summaries per user per day (-1 = unlimited)
    session_days: int = 60

    # --- Transcription ----------------------------------------------------
    whisper_model: str = "large-v3-turbo"
    whisper_compute_type: str = "int8"
    whisper_threads: int = Field(default_factory=lambda: min(8, os.cpu_count() or 4))
    whisper_beam_size: int = 5
    languages: str = "fr,he,en"  # languages the detector may choose from

    # --- Speaker diarization ---------------------------------------------
    diarization: bool = True
    diarization_threshold: float = 0.5  # higher = fewer speakers
    diarization_threads: int = 4

    # --- LLM (any OpenAI-compatible API: OpenRouter, OpenAI, Ollama, vLLM...) ---
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = ""
    llm_model: str = "anthropic/claude-sonnet-5.5"
    llm_reasoning_effort: str = ""  # OpenRouter only: low|medium|high, empty = provider default
    llm_timeout: float = 180

    # --- Email (optional, for password reset) ----------------------------
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_ssl: bool = False  # True = implicit TLS (port 465); False = STARTTLS

    @field_validator("data_dir", mode="after")
    @classmethod
    def _abs(cls, v: Path) -> Path:
        return v.expanduser().resolve()

    # --- Derived helpers ------------------------------------------------------
    @property
    def models_path(self) -> Path:
        return (self.models_dir or self.data_dir / "models").expanduser().resolve()

    @property
    def db_path(self) -> Path:
        return self.data_dir / "myaudiobook.db"

    @property
    def audio_dir(self) -> Path:
        return self.data_dir / "audio"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    @property
    def allowed_origins(self) -> list[str]:
        origins = [self.public_url.rstrip("/")]
        origins += [o.strip().rstrip("/") for o in self.extra_origins.split(",") if o.strip()]
        return origins

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def language_list(self) -> list[str]:
        return [x.strip().lower() for x in self.languages.split(",") if x.strip()]

    @property
    def free_quota_seconds(self) -> float:
        return -1 if self.free_quota_minutes < 0 else self.free_quota_minutes * 60

    @property
    def cookie_secure(self) -> bool:
        return self.public_url.startswith("https://")

    @property
    def llm_enabled(self) -> bool:
        # Local servers (Ollama...) usually need no key.
        return bool(self.llm_api_key) or "localhost" in self.llm_base_url or "127.0.0.1" in self.llm_base_url

    @property
    def mail_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    for d in (s.data_dir, s.audio_dir, s.tmp_dir, s.models_path):
        d.mkdir(parents=True, exist_ok=True)
    return s
