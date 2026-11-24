# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub Security Advisories:

https://github.com/Lomchat/my-audio-book/security/advisories/new

Include a description, steps to reproduce, the affected version, and the impact you see. We will acknowledge your report as soon as we can, work on a fix, and credit you in the release notes if you wish.

## Scope

In scope: the backend API, authentication and sessions, access control between accounts, file upload handling, the web app, and the Docker setup.

Out of scope: vulnerabilities in third-party services you configure (LLM provider, Google, SMTP), or in a deployment that exposes the app without HTTPS.

## Supported versions

Only the latest release receives security fixes.

## Hardening tips

- Serve the app over HTTPS and set `PUBLIC_URL` accordingly.
- Keep `.env` private and rotate `LLM_API_KEY`, `GOOGLE_CLIENT_SECRET` and SMTP credentials if exposed.
- Set `ALLOW_SIGNUP=false` for a private instance.
- Keep the Docker image updated.
