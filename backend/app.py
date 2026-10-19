"""Same-origin account and character API; all authorization stays on the server."""
import hashlib
import json
import os
import secrets
import sqlite3
import time
import threading
import uuid
from contextlib import asynccontextmanager
from typing import Any

from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import FastAPI, Request, Response, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator

from .db import connect, migrate

COOKIE = '__Host-dnd-session'
SESSION_LIFE = 30 * 86400
ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1, type=Type.ID)
DUMMY_HASH = ph.hash(secrets.token_urlsafe(32))
# Bound memory-heavy password work to 128 MiB in the 1 GiB container.
password_slots = threading.BoundedSemaphore(2)


def hash_password(password):
    with password_slots:
        return ph.hash(password)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def now():
    return int(time.time())


def origin():
    return os.environ.get('DND_ORIGIN', 'https://dnd.blockerbunch.com').rstrip('/')


@asynccontextmanager
async def lifespan(app):
    migrate()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def private_responses(request, call_next):
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        if request.headers.get('origin') != origin():
            return Response('Forbidden origin', status_code=403, headers={'Cache-Control': 'no-store'})
        if request.headers.get('content-length', '0').isdigit() and int(request.headers.get('content-length', '0')) > 1_048_576:
            return Response('Request too large', status_code=413)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store, private'
    response.headers['Vary'] = 'Cookie'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


def current(request: Request):
    token = request.cookies.get(COOKIE, '')
    with connect() as db:
        row = db.execute('SELECT s.*, u.username FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?', (digest(token), now())).fetchone()
    if not row:
        raise HTTPException(401, 'Session expired. Sign in again; your recovery draft is retained.')
    if request.method not in ('GET', 'HEAD'):
        if not secrets.compare_digest(request.headers.get('x-csrf-token', ''), row['csrf']):
            raise HTTPException(403, 'Invalid CSRF token')
    return dict(row)


def authenticated(session=Depends(current)):
    if not session['user_id']:
        raise HTTPException(401, 'Sign in required')
    return session


def issue(response, user_id=None, old=None):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with connect() as db:
        db.execute('DELETE FROM sessions WHERE expires_at<=?', (now(),))
        if old:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (old,))
        db.execute('INSERT INTO sessions VALUES (?,?,?,?)', (digest(token), user_id, csrf, now() + (SESSION_LIFE if user_id else 3600)))
        user = db.execute('SELECT id, username FROM users WHERE id=?', (user_id,)).fetchone()
    response.set_cookie(COOKIE, token, max_age=SESSION_LIFE if user_id else 3600, secure=True, httponly=True, samesite='lax', path='/')
    return {'user': dict(user) if user else None, 'csrf': csrf}


def rate(key, limit, seconds):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM rate_limits WHERE expires_at<=?', (now(),))
        db.execute('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1', (key, now()+seconds))
        hits = db.execute('SELECT hits FROM rate_limits WHERE key=?', (key,)).fetchone()[0]
    if hits > limit:
        raise HTTPException(429, 'Too many attempts. Try again later.', headers={'Retry-After': str(seconds)})


def throttle(request, action, username=''):
    # Only Nginx on loopback reaches Uvicorn. Nginx replaces this header;
    # arbitrary public X-Forwarded-For values are never trusted.
    ip = request.headers.get('x-real-ip') or (request.client.host if request.client else 'unknown')
    rate(action + ':ip:' + digest(ip), 20 if action == 'register' else 100, 3600 if action == 'register' else 900)
    if username:
        rate(action + ':user:' + digest(username.lower()), 10, 900)


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r'^[A-Za-z0-9_-]+$')
    password: str = Field(min_length=8, max_length=128)


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    password: str = Field(min_length=8, max_length=128)


class ResetPassword(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=8, max_length=128)


class CharacterWrite(BaseModel):
    client_id: uuid.UUID
    data: dict[str, Any]
    revision: int = Field(default=0, ge=0)

    @field_validator('data')
    @classmethod
    def validate_data(cls, value):
        if len(json.dumps(value, allow_nan=False).encode()) > 900_000:
            raise ValueError('Character too large')
        if value.get('variant') not in ('dnd5e', 'dnd2024', 'brancalonia', 'apocalisse'):
            raise ValueError('Unknown game variant')
        return value


class ShareWrite(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r'^[A-Za-z0-9_-]+$')


def verify(password, hashed):
    try:
        with password_slots:
            return ph.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


@app.get('/api/health')
def health():
    with connect() as db:
        db.execute('SELECT 1 FROM users').fetchone()
    return {'status': 'ok', 'commit': os.environ.get('DND_COMMIT', 'development')}


@app.get('/api/session')
def session(request: Request, response: Response):
    try:
        s = current(request)
        return {'user': {'id': s['user_id'], 'username': s['username']} if s['user_id'] else None, 'csrf': s['csrf']}
    except HTTPException:
        return issue(response)


@app.post('/api/register', status_code=201)
def register(body: Credentials, request: Request, response: Response, s=Depends(current)):
    throttle(request, 'register', body.username)
    user_id = str(uuid.uuid4())
    hashed = hash_password(body.password)
    try:
        with connect() as db:
            db.execute('INSERT INTO users VALUES (?,?,?,?)', (user_id, body.username, hashed, now()))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Username unavailable') from None
    return issue(response, user_id, s['token_hash'])


@app.post('/api/login')
def login(body: Credentials, request: Request, response: Response, s=Depends(current)):
    throttle(request, 'login', body.username)
    with connect() as db:
        user = db.execute('SELECT * FROM users WHERE username=?', (body.username,)).fetchone()
    if not verify(body.password, user['password_hash'] if user else DUMMY_HASH):
        raise HTTPException(401, 'Invalid username or password')
    return issue(response, user['id'], s['token_hash'])


@app.post('/api/logout')
def logout(response: Response, s=Depends(current)):
    return issue(response, old=s['token_hash'])


@app.post('/api/password')
def change_password(body: PasswordChange, request: Request, response: Response, s=Depends(authenticated)):
    throttle(request, 'password', s['username'])
    with connect() as db:
        hashed = db.execute('SELECT password_hash FROM users WHERE id=?', (s['user_id'],)).fetchone()[0]
    if not verify(body.current_password, hashed):
        raise HTTPException(403, 'Current password incorrect')
    new_hash = hash_password(body.password)
    with connect() as db:
        db.execute('UPDATE users SET password_hash=? WHERE id=?', (new_hash, s['user_id']))
        db.execute('DELETE FROM sessions WHERE user_id=?', (s['user_id'],))
        db.execute('DELETE FROM reset_links WHERE user_id=?', (s['user_id'],))
    return issue(response, s['user_id'])


@app.post('/api/reset-password')
def reset_password(body: ResetPassword, request: Request, response: Response, s=Depends(current)):
    throttle(request, 'reset')
    hashed = hash_password(body.password)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        link = db.execute('SELECT * FROM reset_links WHERE token_hash=? AND expires_at>?', (digest(body.token), now())).fetchone()
        if not link:
            raise HTTPException(400, 'Reset link invalid or expired')
        db.execute('UPDATE users SET password_hash=? WHERE id=?', (hashed, link['user_id']))
        db.execute('DELETE FROM sessions WHERE user_id=?', (link['user_id'],))
        db.execute('DELETE FROM reset_links WHERE user_id=?', (link['user_id'],))
    return issue(response, link['user_id'], s['token_hash'])


def accessible(db, char_id, user_id, owner_only=False):
    row = db.execute('SELECT c.*, u.username AS owner FROM characters c JOIN users u ON u.id=c.owner_id WHERE c.id=? AND (c.owner_id=? OR EXISTS(SELECT 1 FROM shares WHERE character_id=c.id AND user_id=?))', (char_id, user_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, 'Character not found')
    if owner_only and row['owner_id'] != user_id:
        raise HTTPException(403, 'Only the owner can change this character')
    return row


def serialized(row, user_id, full=True):
    data = json.loads(row['data'])
    result = {'id': row['id'], 'client_id': row['client_id'], 'revision': row['revision'], 'updated_at': row['updated_at'], 'owner': row['owner'], 'editable': row['owner_id'] == user_id, 'name': str(data.get('name') or 'Unfinished character'), 'variant': data['variant']}
    if full:
        result['data'] = data
    return result


@app.get('/api/characters')
def library(s=Depends(authenticated)):
    with connect() as db:
        rows = db.execute('SELECT c.*, u.username AS owner FROM characters c JOIN users u ON u.id=c.owner_id WHERE c.owner_id=? OR EXISTS(SELECT 1 FROM shares WHERE character_id=c.id AND user_id=?) ORDER BY c.updated_at DESC', (s['user_id'], s['user_id'])).fetchall()
    return [serialized(row, s['user_id'], False) for row in rows]


@app.post('/api/characters', status_code=201)
def create_character(body: CharacterWrite, s=Depends(authenticated)):
    data = dict(body.data)
    data['id'] = str(body.client_id)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        # Idempotent retry: a lost response must not create a duplicate or overwrite.
        db.execute('INSERT INTO characters VALUES (?,?,?,?,1,?) ON CONFLICT(owner_id,client_id) DO NOTHING', (str(uuid.uuid4()), s['user_id'], str(body.client_id), json.dumps(data, allow_nan=False), now()))
        row = db.execute('SELECT c.*, u.username AS owner FROM characters c JOIN users u ON u.id=c.owner_id WHERE c.owner_id=? AND c.client_id=?', (s['user_id'], str(body.client_id))).fetchone()
    return serialized(row, s['user_id'])


@app.get('/api/characters/{char_id}')
def get_character(char_id: uuid.UUID, s=Depends(authenticated)):
    with connect() as db:
        return serialized(accessible(db, str(char_id), s['user_id']), s['user_id'])


@app.put('/api/characters/{char_id}')
def save_character(char_id: uuid.UUID, body: CharacterWrite, s=Depends(authenticated)):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = accessible(db, str(char_id), s['user_id'], True)
        if body.revision != row['revision']:
            raise HTTPException(409, 'Character changed on another device. Reload or export your draft.')
        data = dict(body.data)
        data['id'] = row['client_id']
        db.execute('UPDATE characters SET data=?, revision=revision+1, updated_at=? WHERE id=?', (json.dumps(data, allow_nan=False), now(), str(char_id)))
        row = accessible(db, str(char_id), s['user_id'])
    return serialized(row, s['user_id'])


@app.delete('/api/characters/{char_id}')
def delete_character(char_id: uuid.UUID, revision: int, s=Depends(authenticated)):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = accessible(db, str(char_id), s['user_id'], True)
        if revision != row['revision']:
            raise HTTPException(409, 'Character changed. Refresh your library before deleting.')
        db.execute('DELETE FROM characters WHERE id=?', (str(char_id),))
    return {'deleted': True}


@app.get('/api/characters/{char_id}/shares')
def list_shares(char_id: uuid.UUID, s=Depends(authenticated)):
    with connect() as db:
        accessible(db, str(char_id), s['user_id'], True)
        rows = db.execute('SELECT u.username FROM shares s JOIN users u ON u.id=s.user_id WHERE character_id=? ORDER BY u.username', (str(char_id),)).fetchall()
    return [row[0] for row in rows]


@app.post('/api/characters/{char_id}/shares')
def add_share(char_id: uuid.UUID, body: ShareWrite, s=Depends(authenticated)):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        accessible(db, str(char_id), s['user_id'], True)
        user = db.execute('SELECT id FROM users WHERE username=?', (body.username,)).fetchone()
        if not user:
            raise HTTPException(404, 'Username not found')
        if user[0] == s['user_id']:
            raise HTTPException(400, 'You already own this character')
        db.execute('INSERT OR IGNORE INTO shares VALUES (?,?)', (str(char_id), user[0]))
    return {'shared': True}


@app.delete('/api/characters/{char_id}/shares/{username}')
def revoke_share(char_id: uuid.UUID, username: str, s=Depends(authenticated)):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        accessible(db, str(char_id), s['user_id'], True)
        db.execute('DELETE FROM shares WHERE character_id=? AND user_id IN (SELECT id FROM users WHERE username=?)', (str(char_id), username))
    return {'revoked': True}
