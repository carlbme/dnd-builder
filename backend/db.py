"""SQLite connections, versioned migrations and online backups."""
import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timezone


def database_path():
    return Path(os.environ.get('DND_DATABASE', '/var/lib/dnd-builder/characters.sqlite3'))


@contextmanager
def connect(path=None):
    path = Path(path or database_path())
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=15000')
    try:
        with db:
            yield db
    finally:
        db.close()


def backup(destination, source=None):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Exclusive creation protects an earlier backup from accidental overwrite.
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    with connect(source) as src, sqlite3.connect(destination) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed')
    return destination


def migrate():
    path = database_path()
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        version = db.execute('PRAGMA user_version').fetchone()[0]
    files = sorted(Path(__file__).with_name('migrations').glob('*.sql'))
    if version > len(files):
        raise RuntimeError('Database newer than application; restore matching release')
    for file in files:
        number = int(file.name.split('_')[0])
        if number <= version:
            continue
        if path.exists() and path.stat().st_size:
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            backup(path.parent / 'migration-backups' / f'before-{number}-{stamp}.sqlite3')
        with connect() as db:
            # DDL and user_version commit atomically.
            db.executescript('BEGIN IMMEDIATE;\n' + file.read_text() + f'\nPRAGMA user_version={number};\nCOMMIT;')
