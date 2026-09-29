# Security

People Manager is a **single-user app on your own computer**. Its protections are sized for
that: keep other people on your network, other web pages, and accidents away from your data —
not to be an internet-facing service.

## Who can open it

| Settings | Who can open People Manager |
| --- | --- |
| Network access **off** (default) | only this computer — it listens on 127.0.0.1 |
| Network access **on**, login **off** | **anyone on your network**, with no password |
| Network access **on**, login **on** | anyone on your network **who knows the login** |

Settings → General warns when network access is on and the login is off. On a home network
that may be what you want (using it from across the room); on shared Wi-Fi, turn the login on.

## The login

Works the same way as My Business Manager:

- **Settings → Security → Ask for a login.** Off by default.
- The credentials are **one login name and password**, stored in the **password file**
  (default `./.password`) as `{"loginName": "…", "passwordHash": "$2b$10$…"}` — a bcrypt hash,
  never the password itself — with owner-only permissions (0600).
- **No password file** while the login is on → the app asks you to create a login name and
  password (at least 4 characters), writes the file, and signs you in.
- **Forgot the password?** Delete the password file and reload the page. You'll create a new
  login. **Your people are never touched** — the file holds nothing but the login.
- Sign-in attempts are limited to **10 per 5 minutes** per address.
- You stay signed in for `security.sessionHours` (default 12). The session cookie is signed
  with a key made fresh at every start, so **restarting People Manager signs everyone out**.
  The cookie is `HttpOnly` and `SameSite=Strict`.
- A new login with a different login name also signs out existing sessions.

## Guards that are always on

- **Host check.** Requests must name this computer as it really is — `localhost`,
  `127.0.0.1`, and with network access on, this computer's own network addresses and name.
  Anything else gets *421* — this stops “DNS rebinding”, where a web page you visit tricks your
  browser into talking to People Manager under a name of its own.
- **Same-origin changes.** Anything that changes data must come from a People Manager page
  (checked with the browser's `Origin` and `Sec-Fetch-Site` headers). Another web site can't
  make your browser submit changes in the background (*403*).
- **Security headers** (helmet): a strict Content-Security-Policy (only this app's own scripts,
  styles, fonts and images), no framing, no sniffing.
- **Photo files** are served only by person id and file name — no paths, no `..`.
- **Destructive actions** (rebuild, replace all, restore, deleting a field with its values) need
  a typed confirmation word, checked by the server too.

## What it deliberately does not do

- **No HTTPS.** Traffic on your network is plain HTTP. Don't turn on network access on networks
  you don't trust.
- **No encryption at rest.** The data source and photos are ordinary files (or a database).
  FileVault protects them on a Mac.
- **One login, no users.** Everyone who signs in can do everything.
- **The MySQL password** is stored in `config.json` (owner-only) because the app needs it to
  connect. It is masked in Settings and removed from backups.
