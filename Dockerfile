# syntax=docker/dockerfile:1

# --- 1. Build the web app (React PWA) ------------------------------------------
FROM node:24-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Python runtime with ffmpeg and dependencies ------------------------------
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    DATA_DIR=/data \
    FRONTEND_DIR=/app/frontend/dist

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /data && chown app:app /data

# --- 3. Final image: API server and transcription worker (same image) ----------
FROM base
COPY backend/app ./app
COPY --from=frontend /src/frontend/dist /app/frontend/dist
USER app
VOLUME /data
EXPOSE 8000

# Default command: the web server. The worker runs the same image with `python -m app.worker`.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
