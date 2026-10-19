#!/bin/bash
# Run inside container 111 as root after unpacking a new, verified release.
set -euo pipefail
release="${1:?Usage: install-release.sh /opt/dnd-builder/releases/COMMIT}"
[[ "$release" =~ ^/opt/dnd-builder/releases/[a-f0-9]{40}$ ]] || exit 2
commit="${release##*/}"
if ! getent passwd dnd-builder >/dev/null; then
    useradd --system --user-group --home-dir /var/lib/dnd-builder --shell /usr/sbin/nologin dnd-builder
fi
install -d -m 0700 -o dnd-builder -g dnd-builder /var/lib/dnd-builder /var/backups/dnd-builder
install -d -m 0755 /etc/dnd-builder /etc/systemd/system/nginx.service.d
python3 -m venv "$release/.venv"
"$release/.venv/bin/pip" install --disable-pip-version-check -r "$release/backend/requirements.txt"
# Runtime database is always outside the release and outside Git.
if [[ ! -e /etc/dnd-builder/app.env ]]; then
    (umask 027; cat > /etc/dnd-builder/app.env <<ENV
DND_DATABASE=/var/lib/dnd-builder/characters.sqlite3
DND_ORIGIN=https://dnd.blockerbunch.com
DND_COMMIT=$commit
ENV
    )
    chown root:dnd-builder /etc/dnd-builder/app.env
fi
# New release installation is additive. Retain the previous symlink for rollback.
if [[ -e /opt/dnd-builder/current ]]; then
    readlink -f /opt/dnd-builder/current > "$release/previous-release.txt"
    runuser -u dnd-builder -- env DND_DATABASE=/var/lib/dnd-builder/characters.sqlite3 "$release/.venv/bin/python" -m backend.cli backup --directory /var/lib/dnd-builder/pre-release-"$commit"
fi
# On subsequent releases, preserve the original configuration before changes.
for file in nginx.conf locations.conf; do
    if [[ -e /etc/dnd-builder/$file ]]; then cp -a /etc/dnd-builder/"$file" "$release/prior-$file"; fi
    install -m 0644 "$release/deploy/$file" /etc/dnd-builder/"$file"
done
sed 's/proxy_set_header Origin \$http_origin;/proxy_set_header Origin \$dnd_test_origin;/' "$release/deploy/locations.conf" > /etc/dnd-builder/test-locations.conf
install -m 0644 "$release/deploy/nginx-systemd.conf" /etc/systemd/system/nginx.service.d/dnd.conf
for name in dnd-builder.service dnd-backup.service dnd-backup.timer; do
    install -m 0644 "$release/deploy/$name" /etc/systemd/system/"$name"
done
# Stop the old process before migration. Migrations take an additional online backup.
systemctl stop dnd-builder.service || true
cd "$release"
runuser -u dnd-builder -- env DND_DATABASE=/var/lib/dnd-builder/characters.sqlite3 "$release/.venv/bin/python" -m backend.cli migrate
ln -s "$release" /opt/dnd-builder/current.next
mv -T /opt/dnd-builder/current.next /opt/dnd-builder/current
# Record commit without putting credentials in this file.
python3 - "$commit" <<'PY'
from pathlib import Path
import sys
p=Path('/etc/dnd-builder/app.env')
lines=[line for line in p.read_text().splitlines() if not line.startswith('DND_COMMIT=')]
p.write_text('\n'.join(lines)+f'\nDND_COMMIT={sys.argv[1]}\n')
PY
nginx -t -c /etc/dnd-builder/nginx.conf
systemctl daemon-reload
systemctl enable --now dnd-builder.service dnd-backup.timer nginx.service
systemctl restart nginx.service
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:8000/api/health
