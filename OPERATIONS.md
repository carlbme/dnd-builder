# Blocker household D&D Builder

Public source fork: https://github.com/carlbme/dnd-builder
Upstream: https://github.com/Brainstorm-Club/dnd-character-builder
The MIT license, upstream history, credits and game-data attribution are retained.
This fork adds server accounts and private character sharing. There are no
scheduled upstream merges or automatic dependency deployments.

## Runtime

Container 111 (`dnd-builder`) on pve03 is unprivileged Debian 13 with 1 CPU,
1024 MiB RAM, 512 MiB swap and an 8 GiB root disk on zfs_nvme. Initial LAN
address is **192.168.1.72**, assigned by DHCP; MAC **BC:24:11:3D:29:20**.
Reserve that lease if the existing external connector continues to use its LAN
address. A connector installed inside the container would use loopback instead.
The owner created the Cloudflare route to `http://192.168.1.72:80`; this deployment
does not modify that tunnel or install a second connector.

- Source/static releases: `/opt/dnd-builder/releases/<40-character commit>`
- Active symlink: `/opt/dnd-builder/current`
- Nginx configuration: `/etc/dnd-builder/nginx.conf`, `locations.conf`
- Runtime environment: `/etc/dnd-builder/app.env` (root:dnd-builder, 0640)
- Live SQLite: `/var/lib/dnd-builder/characters.sqlite3` (WAL enabled)
- Daily backups: `/var/backups/dnd-builder/daily-YYYY-MM-DD.sqlite3`
- Pre-migration backups: `/var/lib/dnd-builder/migration-backups/`
- Services: `nginx.service`, `dnd-builder.service`, `dnd-backup.timer`

The initial Debian template had redundant `tmp.mount`, `run-lock.mount` and
`dev-mqueue.mount` units failing inside the unprivileged container. They are
masked; nesting/keyctl remain disabled. Existing Proxmox HA and replication
configuration is unchanged.

## Publication gate

Port 80 returns HTTP 503 until the operator explicitly enables public access.
The user configured the Cloudflare tunnel in advance; Nginx holds the app
unpublished while acceptance checks run. After approval, inside container 111:

```sh
install -m 0644 /dev/null /etc/dnd-builder/public-enabled
curl -fsS https://dnd.blockerbunch.com/api/health
```

The flag is checked on each request, so no service reload is needed. To close
access again, rename that flag to a dated disabled flag, retaining the artifact.
Only the authorized operator should change it. The loopback-only listener
`127.0.0.1:8080` serves the app for acceptance checks before publication. Its
Origin rewrite is confined to that listener and must not be exposed publicly.
The production port 80 listener preserves and validates the browser's Origin.

## Health and restart checks

```sh
systemctl is-active nginx dnd-builder dnd-backup.timer
systemctl --failed
curl -fsS http://127.0.0.1:8000/api/health
curl -fsS http://127.0.0.1:8080/api/health
systemctl list-timers dnd-backup.timer
journalctl -u dnd-builder -n 50 --no-pager
```

Health reports the deployed source commit. Session cookies require HTTPS;
opening the LAN IP over plain HTTP is not a supported way to sign in.
Backend API access logging is disabled so reset secrets and character bodies
are not logged. Reset links place the secret in a URL fragment, not a query.

## Accounts and recovery

Registration is open; usernames are case-insensitive (3–32 letters, digits,
underscores or hyphens), with passwords of 12–128 characters. Passwords use
Argon2id. Host-only Secure/HttpOnly/SameSite cookies hold random session tokens;
only token hashes are stored. Sessions last 30 days, and password changes and
password resets invalidate the account's existing sessions. Mutations require
both exact Origin and session-bound CSRF tokens. Login/registration throttles
persist in SQLite. Nginx supplies the trusted request IP; an external connector
may cause multiple people to share its IP bucket.

To produce a single-use reset link valid for 30 minutes, inside container 111:

```sh
cd /opt/dnd-builder/current
runuser -u dnd-builder -- env DND_DATABASE=/var/lib/dnd-builder/characters.sqlite3 \
  .venv/bin/python -m backend.cli reset-link USERNAME
```

The output is a secret. Deliver it privately to the account owner after verifying
identity; do not paste it into Git, public tickets, logs or shared documents.
There is no email delivery or email-based account recovery.

Owners grant/revoke access using Manage sharing in their library. Recipients
can view and export, but every server mutation rejects them. Revocation blocks
future server reads immediately. The view checks again when exporting and
periodically while open. Already rendered or exported information cannot be
recalled. Character links contain a record ID, never character content.

Signed-in changes autosave after one second of inactivity, including unfinished
work. The interface confirms server saves and retains failed drafts separately
for each account. Conflicts preserve the local version and offer export or
explicit reload. Logout clears recovery data and in-memory private characters;
preferences, game assets and original pre-account browser imports remain.
The service worker caches assets only; `/api/` uses NetworkOnly with no SPA
fallback. A connection is required to authenticate/load libraries/complete saves.
Imported JSON always creates a new identity. Existing browser characters are
imported explicitly without removing their original `character` storage value.
Characters from another domain must first be exported there as JSON.

## Backups and restoration

The systemd timer runs at 02:30 container time (America/New_York), before the
existing Proxmox 03:30 job. The SQLite online backup API creates consistent
copies even with WAL and concurrent readers/writers. Every new copy passes
`PRAGMA integrity_check`. Seven daily copies are retained; migration backups
are kept separately. A same-day backup refuses to overwrite an existing file.

```sh
systemctl start dnd-backup.service
journalctl -u dnd-backup.service -n 20 --no-pager
```

Proxmox job `backup-425f8faf-e406` already selects all guests except 101 and 109,
so automatically includes 111 on `nfs_pool`. No job edits are necessary.

For a database restore, first preserve the live database using the online backup
command with a fresh directory, and stop `dnd-builder`. Verify a selected backup
with SQLite's integrity check, copy it to a new private restore directory, and
point `DND_DATABASE` in the environment at that copy. Retain the old database,
its WAL/SHM files, and old environment file as a matched set; never overwrite a
running SQLite file or mix WAL files from different copies. Set ownership to
`dnd-builder:dnd-builder`, mode 0600, and restart the matching application
release. Verify login, owned libraries, shared read-only access and revocation
before enabling public access. Restoring a backup may restore old sessions and
sharing grants, so review access before publishing it.

Backend tests exercise restored accounts, sessions and sharing through the API,
not just file integrity. Browser acceptance tests use a separate local database;
they never create test players in the production database.

## Release and rollback

Build/test in a local checkout with the design-system submodule initialized:

```sh
git submodule update --init --recursive
npm ci
npm run build
npm test
uv venv .venv
uv pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests
npx playwright install chromium
npx playwright test
```

Deploy only a clean committed revision. Package `backend`, `deploy`, `dist`,
`OPERATIONS.md`, `LICENSE` and `DATA-SOURCES.md`, plus a SHA-256 manifest. Unpack
into a new `/opt/dnd-builder/releases/<commit>`; verify the manifest before
running `deploy/install-release.sh <release>` inside container 111. Keep
credentials, runtime DBs, caches and player data out of the archive and Git.
The installer retains the old release path, backs up the database before
upgrades, and each migration also backs up before applying versioned SQL.

For rollback, close public access, preserve the current DB with an online backup,
stop the API, then atomically switch `current` to the recorded previous release.
If its database schema is older, restore the corresponding pre-migration DB as
a new file and update the environment to that file. Never run older code against
a newer schema or silently discard recent player changes. Set `DND_COMMIT` to
the restored commit, restart services, and repeat health/auth/sharing checks.
The first application release has no previous application version; it can be
rolled back to the maintenance gate while preserving all database files.
