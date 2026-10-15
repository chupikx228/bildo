import logging
import sys

APP_LOGGER_NAME = "src"
APP_LOG_FORMAT = "%(message)s"


def configure_logging(level: str) -> None:
    logger = logging.getLogger(APP_LOGGER_NAME)
    logger.setLevel(level)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter(APP_LOG_FORMAT))
        logger.addHandler(handler)
