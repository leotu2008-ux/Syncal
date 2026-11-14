# Syncal

One calendar view for several Google accounts. Sign in with up to **3 Google accounts**
(for example personal, school and work) and every calendar from all of them shows up
together in a single week view.

- Add each account with **+ Add Google account**. Google's account chooser opens every time, so you can pick a different account each time.
- Each account gets its own color. Turn individual calendars on or off in the sidebar.
- If the same meeting is on more than one account, it shows once with a colored dot for each account that has it.
- Everything refreshes every 5 minutes, or when you click **⟳ Sync**.
- It runs entirely in the browser. No server, no database. Sign-in tokens are kept only in this browser, and Syncal only *reads* calendars (`calendar.readonly`).

## One-time setup (about 10 minutes)

Syncal needs a Google OAuth Client ID so Google knows which app is asking for access.

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "Syncal").
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: choose *External* and fill in the app name and your email.
   Add the scope `.../auth/calendar.readonly`.
   While the app is in *Testing*, add **each of the 3 Google accounts** under **Test users**. Only test users can sign in.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   Under **Authorized JavaScript origins**, add the address you'll open Syncal from, e.g.
   `http://localhost:8080` and/or your deployed URL (`https://syncal.vercel.app`).
5. Copy the Client ID into `config.js`:
   ```js
   GOOGLE_CLIENT_ID: "1234-abc.apps.googleusercontent.com",
   ```

## Run it

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>. It has to be served from an authorized origin; opening `index.html` as a file won't work. Any static host (Vercel, Netlify, GitHub Pages) works too.

## Notes

- Google access tokens last about an hour. When one expires, the account shows **Reconnect**. Click it to refresh, usually with no password needed.
- To allow more or fewer accounts, change `MAX_ACCOUNTS` in `config.js`.
