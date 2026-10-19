"""Operator tools. Run as dnd-builder with the same database environment."""
import argparse
import secrets
from datetime import datetime, timezone
from pathlib import Path
from .db import backup, connect, database_path, migrate
from .app import digest, now, origin


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('migrate')
    reset = commands.add_parser('reset-link')
    reset.add_argument('username')
    b = commands.add_parser('backup')
    b.add_argument('--directory', default='/var/backups/dnd-builder')
    args = parser.parse_args()
    if args.command == 'migrate':
        migrate()
    elif args.command == 'reset-link':
        token = secrets.token_urlsafe(32)
        with connect() as db:
            user = db.execute('SELECT id FROM users WHERE username=?', (args.username,)).fetchone()
            if not user:
                raise SystemExit('Username not found')
            db.execute('DELETE FROM reset_links WHERE user_id=? OR expires_at<=?', (user[0], now()))
            db.execute('INSERT INTO reset_links VALUES (?,?,?)', (digest(token), user[0], now()+1800))
        print(f'{origin()}/account/reset#token={token}')
    else:
        folder = Path(args.directory)
        stamp = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        path = folder / f'daily-{stamp}.sqlite3'
        if path.exists():
            raise SystemExit('Today\'s backup already exists; refusing to overwrite')
        backup(path)
        # Retention applies only to daily files created by this command.
        for old in sorted(folder.glob('daily-????-??-??.sqlite3'), reverse=True)[7:]:
            old.unlink()
        print('Verified backup:', path)


if __name__ == '__main__':
    main()
