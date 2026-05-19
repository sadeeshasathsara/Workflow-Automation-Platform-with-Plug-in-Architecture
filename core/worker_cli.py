"""Simple entrypoint to run an RQ worker for the `events` queue.

Usage:
    python -m core.worker_cli

This will start an RQ worker bound to the `events` queue using REDIS_URL env var.
"""
import os
from redis import Redis
from rq import Worker, Queue, Connection
from core.logging_utils import setup_logging, get_logger

setup_logging()
logger = get_logger("worker_cli")


def main():
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    conn = Redis.from_url(redis_url)
    with Connection(conn):
        q = Queue("events")
        worker = Worker([q])
        logger.info("Starting RQ worker for queue: events (Redis: %s)", redis_url)
        worker.work()


if __name__ == "__main__":
    main()
