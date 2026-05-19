import sqlite3
import threading
import time
import json
import os
from typing import Optional, Tuple, Dict, Any
from core.logging_utils import get_logger

logger = get_logger("sqlite_queue")

DB_PATH = os.environ.get("SQLITE_QUEUE_DB", "data/jobs.db")
DB_DIR = os.path.dirname(DB_PATH)


def _ensure_db():
    if DB_DIR and not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plugin_name TEXT,
            method_name TEXT,
            event TEXT,
            data TEXT,
            status TEXT,
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            next_try INTEGER,
            last_error TEXT,
            created_at INTEGER,
            updated_at INTEGER
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status_nexttry ON jobs(status, next_try)")
    conn.commit()
    return conn


_DB_CONN = None
_DB_LOCK = threading.Lock()


def _get_conn():
    global _DB_CONN
    if _DB_CONN is None:
        with _DB_LOCK:
            if _DB_CONN is None:
                _DB_CONN = _ensure_db()
    return _DB_CONN


def enqueue(plugin_name: str, method_name: str, event: str, data: dict, max_attempts: int = 3, backoff: Optional[list] = None) -> int:
    """Insert a new job into the SQLite queue and return job id."""
    if backoff is None:
        backoff = [10, 30, 60]

    now = int(time.time())
    conn = _get_conn()
    cur = conn.cursor()
    payload = json.dumps(data)
    cur.execute(
        "INSERT INTO jobs (plugin_name, method_name, event, data, status, attempts, max_attempts, next_try, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (plugin_name, method_name, event, payload, "pending", 0, max_attempts, now, now, now),
    )
    conn.commit()
    job_id = cur.lastrowid
    logger.info("Enqueued sqlite job %s for %s.%s", job_id, plugin_name, method_name)
    return job_id


def claim_job(timeout: int = 5) -> Optional[Dict[str, Any]]:
    """Atomically claim a pending job whose next_try <= now. Returns job dict or None."""
    conn = _get_conn()
    cur = conn.cursor()
    now = int(time.time())
    try:
        # Begin immediate transaction to prevent races
        cur.execute("BEGIN IMMEDIATE")
        cur.execute(
            "SELECT id, plugin_name, method_name, event, data, attempts, max_attempts FROM jobs WHERE status = 'pending' AND next_try <= ? ORDER BY created_at LIMIT 1",
            (now,)
        )
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None

        job_id = row[0]
        cur.execute(
            "UPDATE jobs SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending'",
            (now, job_id),
        )
        if cur.rowcount != 1:
            conn.commit()
            return None

        conn.commit()

        job = {
            "id": job_id,
            "plugin_name": row[1],
            "method_name": row[2],
            "event": row[3],
            "data": json.loads(row[4]) if row[4] else {},
            "attempts": row[5],
            "max_attempts": row[6],
        }
        return job
    except Exception as exc:
        logger.exception("Error claiming job: %s", exc)
        try:
            conn.rollback()
        except Exception:
            pass
        return None


def mark_done(job_id: int):
    conn = _get_conn()
    cur = conn.cursor()
    now = int(time.time())
    cur.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    conn.commit()
    logger.info("Job %s done and removed", job_id)


def mark_failed(job_id: int, error: str):
    conn = _get_conn()
    cur = conn.cursor()
    now = int(time.time())
    cur.execute("SELECT attempts, max_attempts FROM jobs WHERE id = ?", (job_id,))
    row = cur.fetchone()
    if not row:
        return

    attempts, max_attempts = row
    attempts = attempts + 1
    if attempts < max_attempts:
        # compute next_try using exponential backoff: simple multiplier
        backoff = [10, 30, 60]
        idx = min(attempts - 1, len(backoff) - 1)
        next_try = now + backoff[idx]
        cur.execute(
            "UPDATE jobs SET status = 'pending', attempts = ?, next_try = ?, last_error = ?, updated_at = ? WHERE id = ?",
            (attempts, next_try, error[:2000], now, job_id),
        )
        logger.info("Job %s failed, will retry at %s (attempt %s/%s)", job_id, next_try, attempts, max_attempts)
    else:
        cur.execute(
            "UPDATE jobs SET status = 'failed', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?",
            (attempts, error[:2000], now, job_id),
        )
        logger.warning("Job %s permanently failed after %s attempts", job_id, attempts)

    conn.commit()


def list_failed(limit: int = 50):
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, plugin_name, method_name, event, data, attempts, last_error, created_at FROM jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT ?", (limit,))
    rows = cur.fetchall()
    results = []
    for r in rows:
        try:
            payload = json.loads(r[4]) if r[4] else {}
        except Exception:
            payload = {}
        results.append({
            "id": r[0],
            "plugin_name": r[1],
            "method_name": r[2],
            "event": r[3],
            "data": payload,
            "attempts": r[5],
            "last_error": r[6],
            "created_at": r[7],
        })
    return results
