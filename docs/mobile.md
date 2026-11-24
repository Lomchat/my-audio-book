# Using MyAudioBook on a phone

Your instance must be served over HTTPS (except on `localhost`) for installation, microphone access and the share target to work. See the reverse proxy section of the [README](../README.md#reverse-proxy).

## Install as an app

- **Android (Chrome)**: open your instance, menu (three dots), then **Install app** (or **Add to Home screen**).
- **iPhone / iPad (Safari)**: open your instance, tap the Share button, then **Add to Home Screen**.

The app opens full screen and can record audio directly with the microphone.

## Android: share audio to MyAudioBook

Once installed, MyAudioBook is listed in the Android share menu for audio files. In any recorder or file app, open a recording, tap **Share**, and choose **MyAudioBook**. The file is uploaded to your library.

## iPhone: Shortcut with an API token

iOS Safari web apps cannot receive shared files, so use a Shortcut that calls the API.

### 1. Create an API token

In the app, go to **Settings** and create an API token. Copy it right away: it starts with `mab_` and is shown only once. You can revoke it at any time.

### 2. Build the Shortcut

In the Shortcuts app, create a new shortcut:

1. Open the shortcut's details and enable **Show in Share Sheet**. Set accepted types to **Audio** and **Files**.
2. Add the action **Get Contents of URL**:
   - **URL**: `https://your-instance/api/recordings`
   - **Method**: `POST`
   - **Headers**: `Authorization` = `Bearer mab_your_token`
   - **Request Body**: `Form`, with these fields:
     - `file` (type File) = **Shortcut Input**
     - `language` (type Text, optional) = `auto`, `fr`, `en` or `he` (default `auto`)
3. Add **Show Notification** with a message such as "Sent to MyAudioBook".

### 3. Use it

Open **Voice Memos**, pick a recording, tap Share, and choose your Shortcut. The recording appears in your library and is processed in the background.

## The same call with curl

```bash
curl -X POST https://your-instance/api/recordings \
  -H "Authorization: Bearer mab_your_token" \
  -F "file=@memo.m4a" \
  -F "language=auto"
```

Optional form fields: `language` (`auto` or one of the configured languages), `title`, `recorded_at` (ISO 8601, for example `2026-11-24T09:30:00`), `source` (`upload`, `record`, `share` or `api`).

The response is the created recording (HTTP 201). Typical errors: `413` file too large or too long (see `MAX_UPLOAD_MB`, `MAX_AUDIO_MINUTES`), `402` free quota used up, `415` unreadable audio. Full reference at `/api/docs` on your instance.
