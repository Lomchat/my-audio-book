from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..db import get_db, now_iso
from ..pipeline import PALETTE
from ..search import search_recordings
from ..security import current_user

router = APIRouter(prefix="/api", tags=["library"])

COLOR = "^#[0-9a-fA-F]{6}$"


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str | None = Field(default=None, pattern=COLOR)
    icon: str | None = Field(default=None, max_length=8)


class CategoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    color: str | None = Field(default=None, pattern=COLOR)
    icon: str | None = Field(default=None, max_length=8)


@router.get("/categories")
def categories(user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        """SELECT c.id, c.name, c.color, c.icon,
                  (SELECT COUNT(*) FROM recordings r WHERE r.category_id = c.id AND r.status != 'uploading') AS count
           FROM categories c WHERE c.user_id = ? ORDER BY c.name COLLATE NOCASE""",
        (user["id"],),
    ).fetchall()
    totals = db.execute(
        """SELECT COUNT(*) AS total,
                  SUM(category_id IS NULL) AS uncategorized,
                  SUM(is_favorite) AS favorites
           FROM recordings WHERE user_id = ? AND status != 'uploading'""",
        (user["id"],),
    ).fetchone()
    return {
        "items": [dict(r) for r in rows],
        "total": totals["total"] or 0,
        "uncategorized": totals["uncategorized"] or 0,
        "favorites": totals["favorites"] or 0,
    }


@router.post("/categories", status_code=201)
def create_category(body: CategoryIn, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    name = body.name.strip()
    if db.execute("SELECT 1 FROM categories WHERE user_id = ? AND name = ?", (user["id"], name)).fetchone():
        raise HTTPException(409, detail={"code": "category_exists"})
    n = db.execute("SELECT COUNT(*) FROM categories WHERE user_id = ?", (user["id"],)).fetchone()[0]
    cur = db.execute("INSERT INTO categories(user_id, name, color, icon, created_at) VALUES (?,?,?,?,?)",
                     (user["id"], name, body.color or PALETTE[n % len(PALETTE)], body.icon, now_iso()))
    return {"id": cur.lastrowid, "name": name, "color": body.color or PALETTE[n % len(PALETTE)],
            "icon": body.icon, "count": 0}


@router.patch("/categories/{cat_id}")
def patch_category(cat_id: int, body: CategoryPatch, user: dict = Depends(current_user),
                   db: sqlite3.Connection = Depends(get_db)):
    cat = db.execute("SELECT * FROM categories WHERE id = ? AND user_id = ?", (cat_id, user["id"])).fetchone()
    if cat is None:
        raise HTTPException(404, detail={"code": "not_found"})
    if body.name and body.name.strip().lower() != cat["name"].lower():
        other = db.execute("SELECT id FROM categories WHERE user_id = ? AND name = ?",
                           (user["id"], body.name.strip())).fetchone()
        if other:  # renaming onto an existing category merges them
            db.execute("UPDATE recordings SET category_id = ? WHERE category_id = ?", (other["id"], cat_id))
            db.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
            return {"merged_into": other["id"]}
    db.execute(
        "UPDATE categories SET name = COALESCE(?, name), color = COALESCE(?, color), icon = COALESCE(?, icon) "
        "WHERE id = ?",
        (body.name.strip() if body.name else None, body.color, body.icon, cat_id),
    )
    return dict(db.execute("SELECT id, name, color, icon FROM categories WHERE id = ?", (cat_id,)).fetchone())


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("DELETE FROM categories WHERE id = ? AND user_id = ?", (cat_id, user["id"])).rowcount:
        raise HTTPException(404, detail={"code": "not_found"})
    return Response(status_code=204)


@router.get("/tags")
def tags(user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        """SELECT j.value AS name, COUNT(*) AS count FROM recordings r, json_each(r.tags) j
           WHERE r.user_id = ? GROUP BY j.value ORDER BY count DESC, name LIMIT 200""",
        (user["id"],),
    ).fetchall()
    return {"items": [dict(r) for r in rows]}


@router.get("/search")
def search(q: str = Query(..., min_length=1, max_length=200), user: dict = Depends(current_user),
           db: sqlite3.Connection = Depends(get_db)):
    return {"items": search_recordings(db, user["id"], q)}
