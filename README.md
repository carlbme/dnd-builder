# Blocker Bunch D&D Builder

A D&D character builder with private accounts, server autosave, and view-only
sharing with your DM or other registered players.

**[Open the application](https://dnd.blockerbunch.com)** ·
[Changelog](CHANGELOG.md) · [Operations guide](OPERATIONS.md) ·
[Original project](https://github.com/Brainstorm-Club/dnd-character-builder)

This is a fork of **Brainstorm Club's D&D Character Builder**, originally
created by fullo. It preserves the upstream Vue builder, game data, exports,
history, and attribution, and adds a FastAPI/SQLite account service.

## Features

- **Four game variants:** D&D 5e (2014), D&D 2024, Brancalonia, and Apocalisse.
- **Character creation:** guided builder, random generation, and editable sheets.
- **Private libraries:** open registration with username/password accounts.
- **Server autosave:** saves edits after one second of inactivity, including
  unfinished characters, with visible pending, saving, saved, and failed states.
- **View-only sharing:** grant access to an existing username, view characters
  in **Shared with me**, and revoke future server access.
- **Conflict protection:** revision checks preserve unsaved work when another
  device has saved a newer version; export the draft or reload the server copy.
- **PDF and JSON:** upstream-compatible JSON import/export and English PDF sheets, with
  additional pages for long notes, extra spells, and setting-specific details.
- **Recovery drafts:** account-scoped browser drafts retain edits during a
  connection failure and retry after reconnecting.
- **English only:** builder, rules explanations, built-in characters, and PDF
  exports use English, with light and dark themes and root-domain PWA assets.
  Existing player-written notes and names remain as entered.

## Using the application

1. Open [dnd.blockerbunch.com](https://dnd.blockerbunch.com) and register or sign in.
   Usernames are case-insensitive and contain 3–32 letters, digits, underscores,
   or hyphens. Passwords must contain **8–128 characters**.
2. Choose a game variant and create, randomly generate, or import a character.
3. Wait for **Saved on server** before relying on the server copy. Your library
   is available after signing in from another browser or device.
4. In the library, select **Manage sharing** and grant an existing username
   access. Send that player the character link; they must sign in with the
   account you selected.
5. Use **View / Export** to read a sheet or download its PDF/JSON. Recipients
   cannot edit, delete, or manage sharing on the owner's character.

Shared links and QR codes contain authenticated record links rather than
character JSON. Revoking a grant blocks future server access; already viewed,
exported, or downloaded copies cannot be recalled.

### Existing characters and connection failures

Use **Import existing browser characters** in the library to create new server
copies without deleting the original browser records. JSON imports also create
new records. Characters stored on another website address must first be
exported there, then imported here as JSON.

Authentication, server libraries, and completed saves require connectivity.
The service worker caches application assets; private API responses are never
cached. If a save fails, retain the tab or export the recovery draft until the
server confirms saving. Logout clears account recovery drafts and private
in-memory character data from this browser.

If you forget your password, ask the site operator for a single-use reset link.
Links expire after 30 minutes. There is no email delivery service.

## Run locally

Requirements: Git with submodule support, Node.js **22.12 or newer**, and
Python **3.12 or newer** with virtual-environment support.

```sh
git clone --recurse-submodules https://github.com/carlbme/dnd-builder.git
cd dnd-builder
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Start the backend in one terminal. It creates the development database and
applies versioned migrations on startup:

```sh
DND_DATABASE="$PWD/.work/dev.sqlite3" \
DND_ORIGIN=http://localhost:5173 \
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```sh
npm run dev -- --host localhost --port 5173 --strictPort
```

Open **http://localhost:5173/**. Vite proxies `/api` to the local backend. Use
`localhost` for browser development; production sign-in uses HTTPS because
session cookies are Secure and HttpOnly. `DND_ORIGIN` must match the browser's
origin exactly. `DND_DEV_BACKEND` can override Vite's default backend target
of `http://127.0.0.1:8000`.

## Build and verify

```sh
npm run build
npm test
.venv/bin/python -m pytest backend/tests
npx playwright install chromium
npx playwright test
```

Build before running the frontend tests: some checks inspect the generated PWA
worker and manifest. The production frontend is written to **`dist/`**.
Playwright starts its own local services and uses a separate test database under
ignored `.work/`; it does not create players in the deployed library.

The inherited `docs/` directory is an upstream GitHub Pages snapshot. It is not
the current fork's build output. This fork requires both its static frontend
and backend; GitHub Pages alone cannot provide accounts or server libraries.

## Architecture and deployment

| Component | Role |
| --- | --- |
| Vue 3, TypeScript, Pinia, Vite, Tailwind CSS | Builder, libraries, recovery drafts, and application assets |
| FastAPI and SQLite | Users, sessions, character JSON, revisions, sharing grants, and schema migrations |
| Argon2id and secure cookies | Password hashing and session authentication, with CSRF checks and rate limits |
| Nginx and systemd | Static assets, same-origin API proxy, application startup, and scheduled backups |
| Cloudflare Tunnel | Public HTTPS connection to the deployed origin |

See [OPERATIONS.md](OPERATIONS.md) for the Proxmox deployment, configuration,
health checks, publication gate, password-reset commands, nightly consistent
SQLite backups, restoration, versioned releases, and rollback. The database and
all credentials and player data remain outside Git. Upstream updates are manual.

## Credits and licenses

The application retains the original **MIT license**, including
**Copyright (c) 2025 fullo**. See [LICENSE](LICENSE).

The original builder and design system come from
[Brainstorm Club](https://www.brainstormclub.it/). The design system is included
as a Git submodule. This fork's source is maintained at
[carlbme/dnd-builder](https://github.com/carlbme/dnd-builder).

Game data and sheet templates have their own sources, copyright notices, and
licensing terms. See [DATA-SOURCES.md](DATA-SOURCES.md) and the application's
[Credits & licenses page](https://dnd.blockerbunch.com/credits), which preserves
SRD and other game-material attribution.
