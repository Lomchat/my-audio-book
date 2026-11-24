"""FastAPI application: JSON API under /api, and the built web app (PWA) everywhere else.

    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from .config import VERSION, get_settings
from .db import connect, migrate
from .routers import account, auth, chat, google, library, meta, recordings

log = logging.getLogger("app")

FRONTEND_DIR = Path(os.environ.get("FRONTEND_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))


def _cleanup_stale_uploads() -> None:
    """Uploads interrupted by a restart leave 'uploading' rows behind."""
    s = get_settings()
    db = connect()
    try:
        rows = db.execute("SELECT id, user_id FROM recordings WHERE status = 'uploading' "
                          "AND created_at < strftime('%Y-%m-%dT%H:%M:%S','now','-1 hour')").fetchall()
        for r in rows:
            db.execute("DELETE FROM recordings WHERE id = ?", (r["id"],))
            shutil.rmtree(s.audio_dir / str(r["user_id"]) / str(r["id"]), ignore_errors=True)
        db.execute("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%S','now')")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    migrate()
    _cleanup_stale_uploads()
    yield


app = FastAPI(title="MyAudioBook API", version=VERSION, lifespan=lifespan,
              docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")

CSP = ("default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
       "script-src 'self'; connect-src 'self'; font-src 'self' data:; worker-src 'self'; manifest-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def guards(request: Request, call_next):
    # Reject oversized uploads before reading the body.
    if request.method == "POST" and request.url.path == "/api/recordings":
        length = request.headers.get("content-length")
        limit = get_settings().max_upload_mb * 1024 * 1024 + 64 * 1024
        if length and length.isdigit() and int(length) > limit:
            return JSONResponse({"detail": {"code": "file_too_large", "max_mb": get_settings().max_upload_mb}},
                                status_code=413)
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
    if not request.url.path.startswith("/api/docs"):
        h.setdefault("Content-Security-Policy", CSP)
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    errors = [{"loc": list(e.get("loc", [])), "msg": e.get("msg")} for e in exc.errors()]
    return JSONResponse({"detail": {"code": "validation_error", "errors": errors}}, status_code=422)


for r in (auth.router, google.router, recordings.router, library.router, chat.router, account.router, meta.router):
    app.include_router(r)


# --- Web app (single-page application) -----------------------------------------


@app.post("/share-target", include_in_schema=False)
def share_target_fallback():
    """The service worker normally handles Android shares; without it, just open the share page."""
    return RedirectResponse("/share", status_code=303)


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, detail={"code": "not_found"})
    index = FRONTEND_DIR / "index.html"
    if not index.exists():
        return JSONResponse({"detail": "Frontend not built. Run: cd frontend && npm install && npm run build"},
                            status_code=503)
    if path:
        candidate = (FRONTEND_DIR / path).resolve()
        if candidate.is_file() and FRONTEND_DIR.resolve() in candidate.parents:
            if path.startswith("assets/"):
                cache = "public, max-age=31536000, immutable"
            elif path in ("sw.js", "manifest.webmanifest"):
                cache = "no-cache"
            else:
                cache = "public, max-age=3600"
            return FileResponse(candidate, headers={"Cache-Control": cache})
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
