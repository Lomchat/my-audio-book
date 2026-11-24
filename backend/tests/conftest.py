import os
import subprocess
import tempfile
from pathlib import Path

import pytest

# Isolated data directory and settings, before the app is imported.
_tmp = tempfile.mkdtemp(prefix="mab-test-")
os.environ.update({
    "ENV_FILE": "/nonexistent",
    "DATA_DIR": _tmp,
    "FREE_QUOTA_MINUTES": "0.5",  # 30 seconds
    "LLM_API_KEY": "",
    "LLM_BASE_URL": "https://llm.invalid/v1",
})

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client_factory():
    clients = []

    def make() -> TestClient:
        c = TestClient(app, headers={"X-Requested-With": "mab"})
        c.__enter__()
        clients.append(c)
        return c

    yield make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture(scope="session")
def tone():
    """Returns a path to a generated WAV tone of the requested length."""
    def make(seconds: float) -> Path:
        path = Path(_tmp) / f"tone-{seconds}.wav"
        if not path.exists():
            subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi",
                            "-i", f"sine=frequency=440:duration={seconds}", str(path)], check=True)
        return path
    return make
