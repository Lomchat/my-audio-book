"""Speech-to-text with faster-whisper (Whisper large-v3-turbo by default), on CPU."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from .config import get_settings
from .modelstore import ensure_whisper

log = logging.getLogger("stt")


@dataclass
class Word:
    start: float
    end: float
    text: str
    speaker: int | None = None


@dataclass
class Segment:
    start: float
    end: float
    text: str
    words: list[Word] = field(default_factory=list)
    speaker: int | None = None


class Transcriber:
    def __init__(self) -> None:
        from faster_whisper import WhisperModel

        s = get_settings()
        path = ensure_whisper()
        log.info("Loading Whisper from %s (%s, %d threads)", path, s.whisper_compute_type, s.whisper_threads)
        self.model = WhisperModel(str(path), device="cpu", compute_type=s.whisper_compute_type,
                                  cpu_threads=s.whisper_threads)

    def detect_language(self, audio: np.ndarray, allowed: list[str]) -> str:
        if len(allowed) == 1:
            return allowed[0]
        _, _, probs = self.model.detect_language(audio=audio, vad_filter=True, language_detection_segments=3)
        scores = dict(probs)
        candidates = allowed or list(scores)
        return max(candidates, key=lambda lang: scores.get(lang, 0.0))

    def transcribe(self, audio: np.ndarray, language: str,
                   on_progress: Callable[[float], None] | None = None) -> list[Segment]:
        s = get_settings()
        duration = max(len(audio) / 16000, 0.001)
        segments_iter, _info = self.model.transcribe(
            audio,
            language=language,
            beam_size=s.whisper_beam_size,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,  # avoids repetition loops on long audio
        )
        out: list[Segment] = []
        for seg in segments_iter:
            words = [Word(round(w.start, 2), round(w.end, 2), w.word) for w in (seg.words or [])]
            text = seg.text.strip()
            if not text:
                continue
            out.append(Segment(round(seg.start, 2), round(seg.end, 2), text, words))
            if on_progress:
                on_progress(min(seg.end / duration, 1.0))
        return out
