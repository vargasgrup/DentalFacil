"""Logging estructurado (stdlib) para DentalFácil / DentalSimple.

Uso:
    from app.logging_config import configure_logging, get_logger
    configure_logging()  # una vez al arrancar
    log = get_logger("main")
    log.info("ready")
"""

from __future__ import annotations

import logging
import os
import sys


_CONFIGURED = False


def configure_logging(*, force: bool = False) -> None:
    """Configura el root logger `dentalfacil` una sola vez."""
    global _CONFIGURED
    if _CONFIGURED and not force:
        return

    level_name = (os.getenv("LOG_LEVEL") or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger("dentalfacil")
    root.setLevel(level)
    root.handlers.clear()
    root.propagate = False

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
    )
    root.addHandler(handler)

    # Silenciar ruido de libs de terceros en prod
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.INFO)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Retorna `dentalfacil.<name>` (asegura configure_logging)."""
    if not _CONFIGURED:
        configure_logging()
    if name.startswith("dentalfacil."):
        return logging.getLogger(name)
    return logging.getLogger(f"dentalfacil.{name}")
