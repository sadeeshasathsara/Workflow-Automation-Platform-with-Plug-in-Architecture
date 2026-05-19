import os
from redis import Redis
from rq import Queue
from core.logging_utils import get_logger

logger = get_logger("rq_client")


def get_redis_connection():
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    return Redis.from_url(url)


def get_queue(name="events"):
    try:
        conn = get_redis_connection()
        return Queue(name, connection=conn)
    except Exception as exc:
        logger.warning("Failed to connect to Redis: %s", exc)
        return None
