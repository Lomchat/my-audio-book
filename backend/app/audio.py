"""Audio helpers built on the ffmpeg / ffprobe command-line tools."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


class AudioError(Exception):
    pass


def probe_duration(path: Path) -> float:
    """Duration in seconds. Falls back to a full decode for files without a duration header
    (typical of WebM files produced by the browser's MediaRecorder)."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
             "-of", "json", str(path)],
            capture_output=True, text=True, timeout=60,
        )
    except subprocess.TimeoutExpired as e:
        raise AudioError("probe timeout") from e
    if out.returncode != 0:
        raise AudioError("unreadable audio file")
    info = json.loads(out.stdout or "{}")
    if not any(s.get("codec_type") == "audio" for s in info.get("streams", [])):
        raise AudioError("no audio stream")
    try:
        duration = float(info.get("format", {}).get("duration", "nan"))
    except ValueError:
        duration = float("nan")
    if duration == duration and duration > 0:  # not NaN
        return duration

    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-i", str(path), "-vn", "-f", "null", "-"],
        capture_output=True, text=True, timeout=600,
    )
    times = re.findall(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", out.stderr)
    if not times:
        raise AudioError("could not determine duration")
    h, m, s = times[-1]
    return int(h) * 3600 + int(m) * 60 + float(s)


def _ffmpeg(args: list[str], timeout: int = 3600) -> None:
    out = subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", *args],
                         capture_output=True, text=True, timeout=timeout)
    if out.returncode != 0:
        raise AudioError(out.stderr.strip()[-500:] or "ffmpeg failed")


def to_wav16k(src: Path, dst: Path) -> None:
    """Mono 16 kHz PCM: what Whisper and the diarization models expect."""
    _ffmpeg(["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst)])


def to_playback(src: Path, dst: Path) -> None:
    """AAC in MP4: plays in every browser, including iOS Safari, and supports seeking."""
    _ffmpeg(["-i", str(src), "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(dst)])


def load_wav16k(path: Path):
    """Reads a mono 16-bit PCM WAV (as written by to_wav16k) into float32 samples in [-1, 1]."""
    import wave

    import numpy as np

    with wave.open(str(path), "rb") as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getframerate() != 16000:
            raise AudioError("unexpected wav format")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
