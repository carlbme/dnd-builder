import json
import sqlite3
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app import app, COOKIE, digest, now
from backend.db import connect, backup, migrate

ORIGIN = 'https://dnd.blockerbunch.com'
PASSWORD = 'Test123!'


@pytest.fixture
def environment(tmp_path, monkeypatch):
    path = tmp_path / 'live.sqlite3'
    monkeypatch.setenv('DND_DATABASE', str(path))
    monkeypatch.setenv('DND_ORIGIN', ORIGIN)
    return path


def client():
    c = TestClient(app, base_url=ORIGIN)
    c.headers['Origin'] = ORIGIN
    c.headers['X-CSRF-Token'] = c.get('/api/session').json()['csrf']
    return c


def register(name):
    c = client()
    r = c.post('/api/register', json={'username': name, 'password': PASSWORD})
    assert r.status_code == 201, r.text
    c.headers['X-CSRF-Token'] = r.json()['csrf']
    return c


def create(c, client_id=None):
    ident = str(client_id or uuid.uuid4())
    r = c.post('/api/characters', json={'client_id': ident, 'data': {'id': ident, 'variant': 'dnd5e', 'name': 'Unfinished'}})
    assert r.status_code == 201, r.text
    return r.json()


def test_isolation_sharing_revocation_and_conflicts(environment):
    with TestClient(app):
        alice, bob, dm = register('alice'), register('bob'), register('dungeonmaster')
        a = create(alice)
        path = '/api/characters/' + a['id']
        assert len(alice.get('/api/characters').json()) == 1
        assert bob.get('/api/characters').json() == []
        assert bob.get(path).status_code == 404
        payload = {'client_id': a['client_id'], 'data': a['data'], 'revision': 1}
        assert bob.put(path, json=payload).status_code == 404
        assert bob.delete(path+'?revision=1').status_code == 404
        assert alice.post(path+'/shares', json={'username': 'DUNGEONMASTER'}).status_code == 200
        assert dm.get(path).json()['editable'] is False
        assert len(dm.get('/api/characters').json()) == 1
        assert dm.put(path, json=payload).status_code == 403
        assert dm.delete(path+'?revision=1').status_code == 403
        assert dm.post(path+'/shares', json={'username': 'bob'}).status_code == 403
        assert dm.get(path+'/shares').status_code == 403
        assert dm.delete(path+'/shares/alice').status_code == 403
        assert alice.put(path, json=payload).json()['revision'] == 2
        assert alice.put(path, json=payload).status_code == 409
        assert alice.delete(path+'?revision=1').status_code == 409
        assert alice.delete(path+'/shares/dungeonmaster').status_code == 200
        assert dm.get(path).status_code == 404
        assert dm.get('/api/characters').json() == []
        assert alice.delete(path+'?revision=2').status_code == 200
        assert alice.get(path).status_code == 404


def test_cookies_csrf_origin_logout_and_password(environment):
    with TestClient(app):
        c = client()
        response = c.get('/api/session')
        cookie = response.headers.get('set-cookie', '')
        # Bootstrap sets a secure host-only cookie; existing session does not rotate.
        fresh = TestClient(app, base_url=ORIGIN).get('/api/session')
        for flag in ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/']:
            assert flag in fresh.headers['set-cookie']
        assert 'Domain=' not in fresh.headers['set-cookie']
        assert response.headers['cache-control'] == 'no-store, private'
        body = {'username': 'alice', 'password': PASSWORD}
        assert c.post('/api/register', json=body, headers={'Origin': 'https://evil.example'}).status_code == 403
        assert c.post('/api/register', json=body, headers={'X-CSRF-Token': 'wrong'}).status_code == 403
        c = register('alice')
        old = c.cookies.get(COOKIE)
        r = c.post('/api/password', json={'current_password': PASSWORD, 'password': PASSWORD+'new'})
        assert r.status_code == 200
        c.headers['X-CSRF-Token'] = r.json()['csrf']
        stale = client()
        stale.cookies.set(COOKIE, old, domain='dnd.blockerbunch.com', path='/')
        assert stale.get('/api/characters').status_code == 401
        assert c.post('/api/logout', json={}).status_code == 200
        assert c.get('/api/characters').status_code == 401
        c = client()
        assert c.post('/api/login', json=body).status_code == 401
        body['password'] += 'new'
        assert c.post('/api/login', json=body).status_code == 200
        assert client().post('/api/register', json={'username':'ALICE','password':PASSWORD}).status_code == 409


def test_reset_expiry_one_use_and_session_invalidation(environment):
    with TestClient(app):
        owner = register('alice')
        uid = owner.get('/api/session').json()['user']['id']
        with connect() as db:
            db.execute('INSERT INTO reset_links VALUES (?,?,?)', (digest('e'*40), uid, now()-1))
            db.execute('INSERT INTO reset_links VALUES (?,?,?)', (digest('t'*40), uid, now()+600))
        c = client()
        assert c.post('/api/reset-password', json={'token':'e'*40,'password':PASSWORD}).status_code == 400
        r = c.post('/api/reset-password', json={'token':'t'*40,'password':PASSWORD+'new'})
        assert r.status_code == 200
        c.headers['X-CSRF-Token'] = r.json()['csrf']
        assert owner.get('/api/characters').status_code == 401
        assert c.post('/api/reset-password', json={'token':'t'*40,'password':PASSWORD}).status_code == 400


def test_idempotent_create_backup_restore_and_restart(environment, tmp_path):
    with TestClient(app):
        alice, dm = register('alice'), register('dungeonmaster')
        assert environment.stat().st_mode & 0o777 == 0o600
        a = create(alice)
        assert create(alice, a['client_id'])['id'] == a['id']
        path = '/api/characters/' + a['id']
        alice.post(path+'/shares', json={'username':'dungeonmaster'})
        snapshot = backup(tmp_path/'restored.sqlite3')
        with pytest.raises(FileExistsError):
            backup(snapshot)
        assert len(alice.get('/api/characters').json()) == 1
    # New lifespan, same sessions and records.
    with TestClient(app):
        assert alice.get(path).status_code == 200
        assert dm.get(path).status_code == 200
    with sqlite3.connect(snapshot) as db:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert db.execute('SELECT count(*) FROM shares').fetchone()[0] == 1
        assert db.execute('SELECT count(*) FROM users').fetchone()[0] == 2
    # Exercise restored DB through actual APIs, including auth and permission checks.
    import os
    os.environ['DND_DATABASE'] = str(snapshot)
    with TestClient(app):
        assert alice.get(path).json()['editable'] is True
        assert dm.get(path).json()['editable'] is False
        assert dm.delete(path+'?revision=1').status_code == 403


def test_limits_validation_and_argon2id(environment):
    with TestClient(app):
        c = register('alice')
        with connect() as db:
            assert db.execute('SELECT password_hash FROM users').fetchone()[0].startswith('$argon2id$')
        assert c.post('/api/characters', json={'client_id': str(uuid.uuid4()), 'data': {'variant':'unknown'}}).status_code == 422
        assert c.post('/api/characters', json={'client_id': str(uuid.uuid4()), 'data': {'variant':'dnd5e','name':'a'*910000}}).status_code == 422
        c = client()
        for i in range(10):
            assert c.post('/api/login', json={'username':'alice','password':'wrong password 123'}).status_code == 401
        assert c.post('/api/login', json={'username':'alice','password':PASSWORD}).status_code == 429
        # Rate buckets survive application restarts.
    with TestClient(app):
        assert c.post('/api/login', json={'username':'alice','password':PASSWORD}).status_code == 429


def test_eight_character_password_boundary(environment):
    with TestClient(app):
        c = client()
        assert c.post('/api/register', json={'username': 'eightuser', 'password': '1234567'}).status_code == 422
        c = register('eightuser')  # Exactly eight characters.
        login = client()
        assert login.post('/api/login', json={'username': 'eightuser', 'password': PASSWORD}).status_code == 200
        assert c.post('/api/password', json={'current_password': PASSWORD, 'password': '1234567'}).status_code == 422
        changed = c.post('/api/password', json={'current_password': PASSWORD, 'password': 'Newpass8'})
        assert changed.status_code == 200
        c.headers['X-CSRF-Token'] = changed.json()['csrf']
        uid = changed.json()['user']['id']
        with connect() as db:
            db.execute('INSERT INTO reset_links VALUES (?,?,?)', (digest('r'*40), uid, now()+600))
        assert c.post('/api/reset-password', json={'token': 'r'*40, 'password': '1234567'}).status_code == 422
        assert c.post('/api/reset-password', json={'token': 'r'*40, 'password': 'Reset888'}).status_code == 200
        login = client()
        assert login.post('/api/login', json={'username': 'eightuser', 'password': 'Reset888'}).status_code == 200
