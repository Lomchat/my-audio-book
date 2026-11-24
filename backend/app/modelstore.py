"""Downloads the open models the app runs locally.

    python -m app.modelstore          # download everything (idempotent)

- Whisper (faster-whisper / CTranslate2 format) from Hugging Face — MIT license.
- Speaker segmentation: pyannote segmentation 3.0, ONNX export by sherpa-onnx — MIT license.
- Speaker embeddings: WeSpeaker ResNet34 (VoxCeleb), ONNX export by sherpa-onnx — Apache-2.0.
"""

from __future__ import annotations

import logging
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path

from .config import get_settings

log = logging.getLogger("modelstore")

WHISPER_REPOS = {
    "large-v3-turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    "turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    "large-v3": "Systran/faster-whisper-large-v3",
    "medium": "Systran/faster-whisper-medium",
    "small": "Systran/faster-whisper-small",
}

_SHERPA = "https://github.com/k2-fsa/sherpa-onnx/releases/download"
SEGMENTATION_URL = f"{_SHERPA}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
EMBEDDING_URL = f"{_SHERPA}/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx"


def whisper_dir() -> Path:
    s = get_settings()
    name = s.whisper_model
    if Path(name).is_dir():  # a local CTranslate2 model directory
        return Path(name)
    repo = WHISPER_REPOS.get(name, name)  # also accepts any "org/repo" on Hugging Face
    return s.models_path / "whisper" / repo.replace("/", "--")


def segmentation_model() -> Path:
    return get_settings().models_path / "diarization" / "segmentation.onnx"


def embedding_model() -> Path:
    return get_settings().models_path / "diarization" / "embedding.onnx"


def _download(url: str, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=dst.parent, delete=False) as tmp:
        log.info("Downloading %s", url)
        req = urllib.request.Request(url, headers={"User-Agent": "myaudiobook-model-downloader"})
        with urllib.request.urlopen(req, timeout=120) as r:
            shutil.copyfileobj(r, tmp, length=1 << 20)
    Path(tmp.name).chmod(0o644)
    Path(tmp.name).replace(dst)


def ensure_whisper() -> Path:
    target = whisper_dir()
    if (target / "model.bin").exists():
        return target
    from huggingface_hub import snapshot_download

    s = get_settings()
    repo = WHISPER_REPOS.get(s.whisper_model, s.whisper_model)
    log.info("Downloading Whisper model %s (about 1.6 GB for large-v3-turbo)...", repo)
    snapshot_download(repo_id=repo, local_dir=target,
                      allow_patterns=["*.json", "*.bin", "*.txt", "vocabulary.*", "tokenizer*"])
    return target


def ensure_diarization() -> None:
    seg = segmentation_model()
    if not seg.exists():
        with tempfile.TemporaryDirectory() as d:
            archive = Path(d) / "seg.tar.bz2"
            _download(SEGMENTATION_URL, archive)
            with tarfile.open(archive) as tar:
                member = next(m for m in tar.getmembers() if m.name.endswith("/model.onnx"))
                member.name = "model.onnx"
                tar.extract(member, d, filter="data")
            seg.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(Path(d) / "model.onnx"), seg)
    emb = embedding_model()
    if not emb.exists():
        _download(EMBEDDING_URL, emb)


def ensure_all() -> None:
    ensure_whisper()
    if get_settings().diarization:
        ensure_diarization()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ensure_all()
    log.info("All models are ready in %s", get_settings().models_path)
