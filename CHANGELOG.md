# Changelog

Changes specific to the Blocker Bunch fork are recorded here. The original
Brainstorm Club project's history remains in Git.

## Background translation fix — 2026-10-19

### Fixed

- Restored English and Italian background ability-score headings, explanatory
  +2/+1 hints, and origin-feat labels that previously displayed translation keys.
- Made the background tools heading follow the selected interface language
  instead of always displaying the Italian word “Strumenti”.

## Initial fork release — 2026-10-19

### Added

- Public fork at `carlbme/dnd-builder`, based on
  [Brainstorm-Club/dnd-character-builder](https://github.com/Brainstorm-Club/dnd-character-builder),
  with upstream history, licensing, and attribution retained.
- FastAPI backend and SQLite storage for accounts, sessions, characters,
  revision numbers, and owner-managed view-only sharing.
- Open registration, login/logout, password changes, and operator-generated,
  single-use password-reset links that expire after 30 minutes.
- Argon2id password hashing, secure HttpOnly session cookies, exact-origin and
  CSRF validation, and persistent registration/login rate limits.
- Private character libraries and **Shared with me**, with server-enforced
  ownership and immediate revocation of future server access.
- One-second server autosave for completed and unfinished characters, accurate
  save status, revision-conflict handling, and account-scoped recovery drafts.
- Reconnect retry, draft export/reload options, and logout cleanup of private
  recovery data.
- Explicit browser-character migration and JSON imports that create new server
  records while retaining original browser records.
- Versioned schema migrations, application releases, pre-upgrade database
  backups, and seven retained daily backups using SQLite's online backup API.
- Nginx/systemd deployment on Proxmox container 111 and public HTTPS access at
  `dnd.blockerbunch.com` through the owner-configured Cloudflare Tunnel.
- An operations runbook covering deployment, account recovery, health checks,
  backup/restoration, and rollback; a fork-specific README and changelog.

### Changed

- Preserved the Vue builder, all four game variants, random generation, PDF
  sheets, and upstream-compatible JSON exports while adding server persistence.
- Replaced newly generated character-data links and QR payloads with
  authenticated character links. Recipients can view and export, but cannot
  modify the owner's records or sharing permissions.
- Adapted navigation, PWA manifests, service-worker rules, and metadata to the
  domain root. Private API requests bypass application caches.
- Set the password requirement to **8–128 characters** for registration,
  password changes, and resets, reducing the initial 12-character minimum.
- Replaced the inherited footer's donation button and unqualified EU claim
  with **Blocker Bunch D&D Builder**, explicit upstream credit, fork source,
  original-project, credits/licenses, and privacy links in English and Italian.
- Added explicit MIT software attribution to Credits alongside game-data notices.

### Fixed

- Duplicate/stale PWA manifests and remaining GitHub Pages subdirectory paths.
- Account-interface contrast in light mode and database file permissions for
  CLI-created databases.
- Bounded concurrent password hashing to fit the specified 1 GB container.
- Redundant Debian container mount units that caused initial degraded boot.

### Verification

- Production Vue/TypeScript build passed.
- All **7,686 frontend tests** passed.
- Six backend integration tests passed, including eight-character password
  boundaries, authorization, sessions, conflicts, rate limits, and restoration.
- Chromium acceptance checks passed for registration, private libraries,
  all four variant PDF exports, JSON migration, sharing and revocation,
  concurrent edits, offline recovery, fresh-browser login, and logout cleanup.
- Live HTTPS form/API checks confirmed the eight-character minimum; English
  and Italian footer links, license credits, and mobile layout were verified.
- Container reboot recovery, consistent daily backups, Proxmox backup integrity,
  and database restoration from the container archive were verified. Restored
  account sessions and sharing permissions were tested through the API.

Already downloaded or exported copies cannot be revoked. Server libraries and
completed saves require connectivity; email delivery and automatic upstream
updates are not included in this release.
