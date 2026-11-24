"""The few tests that protect what really matters: account isolation, quotas, CSRF,
and the speaker/word alignment at the heart of the transcript."""

from app.diarize import assign_speakers
from app.stt import Segment, Word



def signup(client, email):
    r = client.post("/api/auth/signup", json={"email": email, "password": "correct horse battery"})
    assert r.status_code == 200, r.text


def upload(client, path, **fields):
    with open(path, "rb") as f:
        return client.post("/api/recordings", files={"file": (path.name, f, "audio/wav")}, data=fields)


def test_users_cannot_reach_each_other_recordings(client_factory, tone):
    alice, bob = client_factory(), client_factory()
    signup(alice, "alice@example.com")
    signup(bob, "bob@example.com")

    rec = upload(alice, tone(3))
    assert rec.status_code == 201, rec.text
    rid = rec.json()["id"]

    assert alice.get(f"/api/recordings/{rid}").status_code == 200
    for method, url in [("get", f"/api/recordings/{rid}"), ("get", f"/api/recordings/{rid}/audio"),
                        ("get", f"/api/recordings/{rid}/download"), ("get", f"/api/recordings/{rid}/export"),
                        ("patch", f"/api/recordings/{rid}"), ("delete", f"/api/recordings/{rid}")]:
        kwargs = {"json": {"title": "x"}} if method == "patch" else {}
        assert getattr(bob, method)(url, **kwargs).status_code == 404, (method, url)
    assert bob.get("/api/recordings").json()["items"] == []
    assert bob.get(f"/api/recordings/status?ids={rid}").json()["items"] == []
    # Chat scoped to someone else's recording must not leak it either.
    assert bob.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}],
                                       "recording_id": rid}).status_code in (404, 501)


def test_free_quota_is_enforced_and_can_be_raised(client_factory, tone):
    from app.db import connect
    from app.manage import set_quota

    carol = client_factory()
    signup(carol, "carol@example.com")  # quota: 30 s (FREE_QUOTA_MINUTES=0.5)
    assert upload(carol, tone(20)).status_code == 201
    over = upload(carol, tone(20))
    assert over.status_code == 402
    assert over.json()["detail"]["code"] == "quota_exceeded"
    me = carol.get("/api/me").json()
    assert 19 < me["quota"]["used_seconds"] < 21  # the rejected upload consumed nothing

    db = connect()
    set_quota(db, "carol@example.com", "unlimited")  # what the server owner runs from the CLI
    db.close()
    assert upload(carol, tone(40)).status_code == 201


def test_cookie_requests_without_csrf_header_are_rejected(client_factory):
    dave = client_factory()
    signup(dave, "dave@example.com")
    r = dave.post("/api/categories", json={"name": "Work"}, headers={"X-Requested-With": ""})
    assert r.status_code == 403
    assert dave.post("/api/categories", json={"name": "Work"}).status_code == 201


def test_speakers_are_assigned_per_word_and_segments_split():
    words = [Word(0.0, 0.5, " Bonjour"), Word(0.5, 1.0, " Sarah."), Word(1.2, 1.6, " Salut"),
             Word(1.6, 2.0, " Paul,"), Word(2.0, 2.4, " ça"), Word(2.4, 2.8, " va ?")]
    segments = [Segment(0.0, 2.8, "Bonjour Sarah. Salut Paul, ça va ?", words)]
    turns = [(0.0, 1.1, 7), (1.1, 3.0, 3)]
    out, n = assign_speakers(segments, turns)
    assert n == 2
    assert [(s.speaker, s.text) for s in out] == [(1, "Bonjour Sarah."), (2, "Salut Paul, ça va ?")]

    single, n1 = assign_speakers([Segment(0.0, 1.0, "Seul.", [Word(0.0, 1.0, " Seul.")])], [(0.0, 1.0, 0)])
    assert n1 == 1 and single[0].speaker is None
