# Google sign-in

Google sign-in is optional. It is enabled when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. MyAudioBook uses the OpenID Connect authorization code flow with PKCE and only requests the `openid email profile` scopes.

The labels below follow the current Google Cloud Console ("Google Auth Platform"); names may shift slightly over time.

## 1. Create a project

1. Open https://console.cloud.google.com/ and create a new project (for example "MyAudioBook").
2. Open **Google Auth Platform** from the navigation menu and click **Get started** if prompted.

## 2. Branding

Under **Branding**, fill in:

- **App name**: shown on the Google consent screen.
- **User support email**.
- **App logo** (optional).
- **Application home page**: your `PUBLIC_URL`.
- **Application privacy policy link**: `<PUBLIC_URL>/privacy`.
- **Application terms of service link**: `<PUBLIC_URL>/terms`.
- **Authorized domains**: the domain of your instance (for example `example.com`). Add one per domain if you use `EXTRA_ORIGINS` on other domains.
- **Developer contact email**.

## 3. Audience

Under **Audience**:

1. Choose user type **External**.
2. Click **Publish app** to move from "Testing" to "In production". While in testing, only listed test users can sign in and tokens expire quickly.

Because only the basic scopes (`openid`, `email`, `profile`) are used, Google does not require app verification.

## 4. Data access

Under **Data access**, click **Add or remove scopes** and select:

- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

Save. Do not add sensitive scopes.

## 5. Create the OAuth client

1. Under **Clients**, click **Create client**.
2. **Application type**: Web application.
3. **Authorized redirect URIs**: add `<origin>/api/auth/google/callback` for `PUBLIC_URL` and for every entry of `EXTRA_ORIGINS`. For example:
   - `https://audio.example.com/api/auth/google/callback`
   - `http://localhost:8000/api/auth/google/callback` (local testing)
4. Create, then copy the client ID and client secret.

The redirect URI must match exactly (scheme, host, port, no trailing slash).

## 6. Configure MyAudioBook

Add to `.env`:

```
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Restart the web service: `docker compose up -d` (or `docker compose restart web`). The "Continue with Google" button then appears on the login page.

## Notes

- If an account with the same verified email already exists, signing in with Google links to it automatically.
- Keep the client secret private; never commit your `.env`.
