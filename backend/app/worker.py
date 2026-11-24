"""Background worker: picks jobs from the SQLite queue and runs the pipeline.

    python -m app.worker

One job at a time (transcription already uses several CPU threads). Run it as a
separate process/container from the web server.
"""

from __future__ import annotations

import logging
import signal
import threading
import time

from .config import get_settings
from .db import connect, migrate, now_iso
from .pipeline import Engines, friendly_error, process, refund, summarize
from .search import index_recording

log = logging.getLogger("worker")
_stop = threading.Event()


def set_state(state: str, message: str = "") -> None:
    db = connect()
    try:
        db.execute(
            "INSERT INTO worker_state(id, state, message, heartbeat_at) VALUES (1,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET state = excluded.state, message = excluded.message, "
            "heartbeat_at = excluded.heartbeat_at",
            (state, message, now_iso()),
        )
    finally:
        db.close()


def _heartbeat() -> None:
    db = connect()
    try:
        while not _stop.wait(10):
            db.execute("UPDATE worker_state SET heartbeat_at = ? WHERE id = 1", (now_iso(),))
    finally:
        db.close()


def claim_job(db) -> dict | None:
    r = db.execute(
        """UPDATE jobs SET status = 'running', started_at = ?, attempts = attempts + 1
           WHERE id = (SELECT id FROM jobs WHERE status = 'pending' ORDER BY id LIMIT 1)
           RETURNING *""",
        (now_iso(),),
    ).fetchone()
    return dict(r) if r else None


def run_job(db, engines: Engines, job: dict) -> None:
    rec_id = job["recording_id"]
    try:
        if job["kind"] == "process":
            process(db, engines, rec_id)
        else:
            summarize(db, rec_id)
            db.execute("UPDATE recordings SET stage = NULL, updated_at = ? WHERE id = ?", (now_iso(), rec_id))
            index_recording(db, rec_id)
        db.execute("UPDATE jobs SET status = 'done', finished_at = ? WHERE id = ?", (now_iso(), job["id"]))
    except Exception as e:
        log.exception("job %s (recording %s) failed", job["id"], rec_id)
        db.execute("UPDATE jobs SET status = 'error', error = ?, finished_at = ? WHERE id = ?",
                   (str(e)[:1000], now_iso(), job["id"]))
        if job["kind"] == "process":
            db.execute("UPDATE recordings SET status = 'error', stage = NULL, error = ?, updated_at = ? WHERE id = ?",
                       (friendly_error(e), now_iso(), rec_id))
            refund(db, rec_id)
        else:
            db.execute("UPDATE recordings SET stage = NULL, summary_status = 'error' WHERE id = ?", (rec_id,))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    s = get_settings()
    migrate()
    signal.signal(signal.SIGTERM, lambda *_: _stop.set())
    signal.signal(signal.SIGINT, lambda *_: _stop.set())

    db = connect()
    # Jobs interrupted by a restart go back to the queue.
    db.execute("UPDATE jobs SET status = 'pending' WHERE status = 'running'")
    db.execute("UPDATE recordings SET status = 'queued', stage = NULL, progress = 0 "
               "WHERE status = 'processing'")

    threading.Thread(target=_heartbeat, daemon=True).start()
    engines = Engines()
    try:
        set_state("loading", "downloading / loading models")
        from .modelstore import ensure_all
        ensure_all()
        _ = engines.stt
        if s.diarization:
            _ = engines.diarizer
    except Exception as e:
        log.exception("model loading failed")
        set_state("error", str(e)[:300])
        raise SystemExit(1) from e

    set_state("ready")
    log.info("Worker ready (model %s, %d threads)", s.whisper_model, s.whisper_threads)
    while not _stop.is_set():
        job = claim_job(db)
        if job is None:
            _stop.wait(1.5)
            continue
        set_state("busy", f"recording {job['recording_id']}")
        started = time.monotonic()
        run_job(db, engines, job)
        log.info("job %s (%s) finished in %.1fs", job["id"], job["kind"], time.monotonic() - started)
        set_state("ready")
    set_state("stopped")
    db.close()


if __name__ == "__main__":
    main()
