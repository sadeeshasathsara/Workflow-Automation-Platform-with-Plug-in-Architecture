"""CLI to run the SQLite-backed queue worker."""
from core.logging_utils import setup_logging, get_logger
from core.sql_worker import run_worker

setup_logging()
logger = get_logger("sql_worker_cli")


def main():
    logger.info("Starting sqlite worker CLI")
    run_worker()


if __name__ == "__main__":
    main()
