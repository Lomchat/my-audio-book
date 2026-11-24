# Contributing

Thanks for your interest in MyAudioBook. Bug reports, ideas and pull requests are welcome.

## Setup

Requirements: Python 3.12, Node 24, ffmpeg.

```bash
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt pytest
cp .env.example .env

cd backend
python -m app.modelstore         # download models (about 1.7 GB)
uvicorn app.main:app --reload    # API on :8000
python -m app.worker             # worker, in another terminal

cd ../frontend
npm install
npm run dev                      # Vite dev server, proxies /api to :8000
```

Or run everything with `docker compose up -d --build`.

## Coding style

- Python: type hints, small functions, standard library first. Keep modules focused. Follow the style of the surrounding code.
- TypeScript/React: functional components, strict types, Tailwind for styling.
- Every setting is an environment variable defined in `backend/app/config.py` and documented in `.env.example` and the README.
- No secrets in the repository. Do not log transcripts or personal data.
- Keep dependencies minimal and pinned.

## Tests

We keep tests few and critical: cover what would really hurt if it broke (quotas, authentication, data access between users, security, data loss, a bug that already happened). Do not add tests for trivial code or several tests checking the same thing. The suite should stay fast (well under a minute).

```bash
cd backend && pytest -q
cd frontend && npm run build
```

## Pull requests

1. Open an issue first for larger changes, to agree on the approach.
2. Fork, create a branch from `main`, and keep the PR focused.
3. Make sure the backend tests, the frontend build and the Docker build pass (CI runs them).
4. Update the documentation when behavior or configuration changes.
5. Describe what changed and why; link the issue.

By contributing you agree that your contribution is licensed under the Apache License 2.0.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](SECURITY.md), not public issues.
