"""Tests for N+1 prefetch helpers and structured logging config."""

from app.db_prefetch import prefetch_by_ids, prefetch_patients
from app.logging_config import configure_logging, get_logger
from app.models import Patient


def test_configure_logging_idempotent():
    configure_logging(force=True)
    log = get_logger("test")
    assert log.name == "dentalfacil.test"
    log.info("structured logging ok")


def test_prefetch_patients_empty(db):
    assert prefetch_patients(db, []) == {}
    assert prefetch_patients(db, [None, ""]) == {}


def test_prefetch_patients_batch(db, patient):
    """One batch query returns map keyed by id."""
    pid = patient["id"]
    mapped = prefetch_by_ids(db, Patient, [pid, pid, "missing-id"])
    assert pid in mapped
    assert mapped[pid].id == pid


def test_health_includes_scheduler(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert "scheduler" in body
    assert "running" in body["scheduler"]
    assert body["scheduler"]["job_id"] == "reminders"
