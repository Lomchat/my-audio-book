"""Instance management from the command line. Every account is a regular user with the same
interface; the person running the server manages quotas here.

    python -m app.manage users [search]          list accounts and their usage
    python -m app.manage quota EMAIL MINUTES     set a lifetime quota (e.g. 120)
    python -m app.manage quota EMAIL unlimited   no limit on audio minutes nor AI messages
    python -m app.manage quota EMAIL default     back to FREE_QUOTA_MINUTES
    python -m app.manage disable EMAIL           block an account (signs it out everywhere)
    python -m app.manage enable EMAIL
    python -m app.manage stats                   instance totals, queue and worker state

With Docker:  docker compose exec web python -m app.manage users
"""

from __future__ import annotations

import sys

from .db import connect, migrate
from .routers.meta import worker_status
from .security import quota_seconds


def _minutes(seconds: float) -> str:
    return "unlimited" if seconds < 0 else f"{seconds / 60:.1f} min"


def _user(db, email: str):
    r = db.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if r is None:
        sys.exit(f"No account with email {email}")
    return dict(r)


def set_quota(db, email: str, value: str) -> str:
    user = _user(db, email)
    if value == "default":
        q = None
    elif value == "unlimited":
        q = -1
    else:
        try:
            q = float(value) * 60
        except ValueError:
            sys.exit("MINUTES must be a number, 'unlimited' or 'default'")
        if q < 0:
            sys.exit("MINUTES must be positive")
    db.execute("UPDATE users SET quota_seconds = ? WHERE id = ?", (q, user["id"]))
    user["quota_seconds"] = q
    return f"{user['email']}: quota {_minutes(quota_seconds(user))}, used {user['used_seconds'] / 60:.1f} min"


def main(argv: list[str]) -> None:
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return
    migrate()
    db = connect()
    cmd, args = argv[0], argv[1:]
    if cmd == "users":
        like = f"%{args[0]}%" if args else "%"
        rows = db.execute(
            "SELECT u.*, (SELECT COUNT(*) FROM recordings r WHERE r.user_id = u.id) AS n FROM users u "
            "WHERE u.email LIKE ? OR u.name LIKE ? ORDER BY u.id", (like, like)).fetchall()
        for r in rows:
            u = dict(r)
            flags = " [disabled]" if u["is_disabled"] else ""
            print(f"{u['id']:>5}  {u['email']:<40} {u['n']:>4} recordings  "
                  f"{u['used_seconds'] / 60:7.1f} / {_minutes(quota_seconds(u)):<12} {u['created_at'][:10]}{flags}")
        print(f"{len(rows)} account(s)")
    elif cmd == "quota" and len(args) == 2:
        print(set_quota(db, args[0], args[1]))
    elif cmd in ("disable", "enable") and len(args) == 1:
        user = _user(db, args[0])
        db.execute("UPDATE users SET is_disabled = ? WHERE id = ?", (int(cmd == "disable"), user["id"]))
        if cmd == "disable":
            db.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        print(f"{user['email']}: {cmd}d")
    elif cmd == "stats":
        u = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        r = db.execute("SELECT COUNT(*), COALESCE(SUM(duration), 0), SUM(status = 'error') FROM recordings").fetchone()
        q = db.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'running')").fetchone()[0]
        print(f"accounts: {u}\nrecordings: {r[0]} ({r[1] / 3600:.1f} h, {r[2] or 0} errors)\nqueue: {q}\n"
              f"worker: {worker_status(db)['state']}")
    else:
        print(__doc__)
        sys.exit(2)
    db.close()


if __name__ == "__main__":
    main(sys.argv[1:])
