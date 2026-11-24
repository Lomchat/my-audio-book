"""Speaker diarization ("who speaks when") with sherpa-onnx, then alignment with Whisper words."""

from __future__ import annotations

import logging
from collections.abc import Callable

import numpy as np

from .config import get_settings
from .modelstore import embedding_model, ensure_diarization, segmentation_model
from .stt import Segment, Word

log = logging.getLogger("diarize")

Turn = tuple[float, float, int]  # (start, end, speaker)


class Diarizer:
    def __init__(self) -> None:
        import sherpa_onnx

        s = get_settings()
        ensure_diarization()
        config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
            segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
                pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(segmentation_model())),
                num_threads=s.diarization_threads,
            ),
            embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
                model=str(embedding_model()), num_threads=s.diarization_threads),
            clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=s.diarization_threshold),
            min_duration_on=0.3,
            min_duration_off=0.5,
        )
        if not config.validate():
            raise RuntimeError("Invalid diarization configuration (missing model files?)")
        self.sd = sherpa_onnx.OfflineSpeakerDiarization(config)

    def run(self, audio: np.ndarray, on_progress: Callable[[float], None] | None = None) -> list[Turn]:
        def cb(done: int, total: int) -> int:
            if on_progress and total:
                on_progress(done / total)
            return 0

        result = self.sd.process(audio, callback=cb).sort_by_start_time()
        return [(t.start, t.end, t.speaker) for t in result]


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def assign_speakers(segments: list[Segment], turns: list[Turn]) -> tuple[list[Segment], int]:
    """Gives each word the speaker whose turn overlaps it most (or the nearest turn),
    splits Whisper segments where the speaker changes, and renumbers speakers 1..N
    in order of first appearance. Returns (segments, number_of_speakers)."""
    if not turns or len({t[2] for t in turns}) < 2:
        return segments, (1 if turns else 0)

    def speaker_at(w0: float, w1: float) -> int:
        best, best_ov = None, 0.0
        for t0, t1, spk in turns:
            if t0 > w1:
                break
            ov = _overlap(w0, w1, t0, t1)
            if ov > best_ov:
                best, best_ov = spk, ov
        if best is not None:
            return best
        mid = (w0 + w1) / 2
        return min(turns, key=lambda t: min(abs(mid - t[0]), abs(mid - t[1])))[2]

    out: list[Segment] = []
    for seg in segments:
        words = seg.words or [Word(seg.start, seg.end, " " + seg.text)]
        for w in words:
            w.speaker = speaker_at(w.start, w.end)
        current: list[Word] = []
        for w in words:
            if current and w.speaker != current[-1].speaker:
                out.append(_segment_from_words(current))
                current = []
            current.append(w)
        if current:
            out.append(_segment_from_words(current))

    # Merge tiny fragments (1-2 words) into their neighbour: usually alignment noise.
    merged: list[Segment] = []
    for seg in out:
        if merged and len(seg.words) <= 2 and seg.speaker != merged[-1].speaker and seg.end - seg.start < 1.0:
            for w in seg.words:
                w.speaker = merged[-1].speaker
            merged[-1] = _segment_from_words(merged[-1].words + seg.words)
        else:
            merged.append(seg)

    mapping: dict[int, int] = {}
    for seg in merged:
        if seg.speaker not in mapping:
            mapping[seg.speaker] = len(mapping) + 1
        seg.speaker = mapping[seg.speaker]
        for w in seg.words:
            w.speaker = seg.speaker
    if len(mapping) < 2:
        for seg in merged:
            seg.speaker = None
            for w in seg.words:
                w.speaker = None
    return merged, len(mapping)


def _segment_from_words(words: list[Word]) -> Segment:
    text = "".join(w.text for w in words).strip()
    return Segment(words[0].start, words[-1].end, text, list(words), words[0].speaker)
