# Our Calendar

Two people's Google Calendars in one view, each in their own color. Each of you
signs in with Google once; after that, the app shows both calendars by day,
week or month, and refreshes every couple of minutes. It's read-only: keep editing in
Google Calendar or Apple Calendar as usual.

Events on both calendars (say, an invite you both accepted) show once with both
colors and "Both".

## Try it with made-up events

```bash
npm install
DEMO_MODE=1 SESSION_SECRET=dev npm run dev
```

Open http://localhost:3000.

## Set up Google sign-in (about 10 minutes, once)

1. Go to https://console.cloud.google.com and create a project, e.g. "Our Calendar".
2. **Turn on the Calendar API:** APIs & Services > Library > search "Google Calendar API" > Enable.
3. **Set up the sign-in screen:** Google Auth Platform > Get started.
   - App name: Our Calendar. Support email: yours.
   - Audience: **External**.
   - Contact email: yours. Agree and create.
4. **Allow calendar access:** Google Auth Platform > Data access > Add or remove scopes.
   Tick `.../auth/calendar.readonly` (and `openid`, `email`, `profile`), then Save.
5. **Publish it:** Google Auth Platform > Audience > **Publish app**.
   Leave it unverified. This matters: in "Testing" mode Google signs you out
   every 7 days. Published-but-unverified works for up to 100 people; each of you
   sees a "Google hasn't verified this app" screen once. Click **Advanced >
   Go to Our Calendar (unsafe)** to continue. It's your own app.
6. **Create the login keys:** Google Auth Platform > Clients > Create client.
   - Type: **Web application**.
   - Authorized redirect URIs: add `http://localhost:3000/api/auth/callback`
     (and later your Vercel URL, see below).
   - Copy the Client ID and Client secret.
7. Copy `.env.example` to `.env.local` and fill in `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (`openssl rand -base64 32`), and
   both of your emails in `ALLOWED_EMAILS`.
8. `npm run dev`, open http://localhost:3000, and sign in.

On your first sign-in you'll pick your color and which of your calendars to show.

## Put it online (Vercel)

1. This repo (github.com/leotu2008-ux/Syncal) is connected to the Vercel project
   `our-calendar`: pushing to `main` deploys to production, other branches get
   preview deployments.
2. In the Vercel project: Storage (or Marketplace) > add **Upstash Redis** and
   connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Settings > Environment Variables: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `SESSION_SECRET`, and `ALLOWED_EMAILS`. Redeploy.
4. Back in Google Cloud > Clients > your client, add
   `https://<your-app>.vercel.app/api/auth/callback` as a redirect URI.
5. Open the site on both phones, sign in, and use Share > **Add to Home Screen**.

## More accounts per person (Google and iCloud)

Each person signs in with the Google account listed in `ALLOWED_EMAILS`. After
that, in **Settings > Your accounts**:

- **Add another Google account** links more Google accounts (school, work, up to
  5 in total). Their calendars show as yours, and you can sign in with any of them.
- **Connect iCloud** reads iCloud calendars directly. Apple has no "Sign in with
  Apple" for calendars, so it uses your Apple ID email and an **app-specific
  password** from https://account.apple.com > Sign-In and Security >
  App-Specific Passwords. It's stored encrypted with `SESSION_SECRET` and only
  sent to Apple's iCloud servers. Revoke it there any time.

- **Add Outlook account** connects Outlook.com, Hotmail and Microsoft 365
  (work or school) calendars. It appears once the Microsoft setup below is done.

Pick which calendars of each account to show under **Calendars to show**.

### Outlook setup (once, about 5 minutes)

1. Go to https://entra.microsoft.com (sign in with any Microsoft account) >
   **App registrations > New registration**.
   - Name: Our Calendar.
   - Supported account types: **Accounts in any organizational directory and
     personal Microsoft accounts**.
   - Redirect URI: **Web**, `https://our-calendar-opal.vercel.app/api/auth/microsoft/callback`
     (add `http://localhost:3000/api/auth/microsoft/callback` too for local use).
2. Copy the **Application (client) ID** into the Vercel env var `MICROSOFT_CLIENT_ID`.
3. **Certificates & secrets > New client secret**. Copy its **Value** into
   `MICROSOFT_CLIENT_SECRET`. (It expires; make a new one when it does.)
4. **API permissions > Add a permission > Microsoft Graph > Delegated**: add
   `Calendars.Read`, `offline_access`, `openid`, `email`, `profile`.
5. Redeploy on Vercel.

## Views

Switch between **Day**, **Week** and **Month** at the top. In Day and Week view,
**Zoom − / +** makes hours shorter or taller, and Week view can show **3 days**,
**Mon–Fri** or all **7**. Each device remembers its own choices.

## Notes

- Sign-ins are stored server-side (Redis on Vercel, `.data/users.json` locally).
  Calendar data is fetched live from Google and never stored.
- To remove someone's access, take their email out of `ALLOWED_EMAILS`. To cut
  off the app entirely, remove it at https://myaccount.google.com/permissions.
- If Google stops accepting someone's sign-in (password change, revoked access),
  the calendar shows a note asking them to sign in again.

## Development

```bash
npm test        # unit tests for date handling and event merging
npm run lint
npm run build
```
