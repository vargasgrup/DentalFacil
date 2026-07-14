"""SQLite UUID baseline — final schema source of truth for local installs.

Revision ID: m0sqlite_uuid_baseline
Revises: l9c0d1e2f3a4
Create Date: 2026-07-14

Notes
-----
- Historical PostgreSQL migrations (JSONB, now(), postgresql_where) are NOT
  re-run against SQLite. For an empty SQLite file, `app.migrate` creates tables
  from SQLAlchemy metadata and stamps this revision as head.
- Against PostgreSQL with existing integer PKs, this revision is a no-op marker:
  use `scripts/pg_to_sqlite_uuid.py` to ETL into a fresh SQLite DB with UUIDs.
- This file does not ALTER historical revisions (by design of the migration prompt).
"""

from alembic import op

revision = "m0sqlite_uuid_baseline"
down_revision = "l9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "sqlite":
        # Schema already created via Base.metadata.create_all in migrate.py
        # (or exists). Ensure pragmas for this connection.
        op.execute("PRAGMA foreign_keys=ON")
        return
    # Postgres residual installs: do not attempt in-place int→uuid ALTER here
    # (unsafe/lossy without full remapping). Operators must export via ETL script.
    print(
        "[dentalfacil] m0sqlite_uuid_baseline: Postgres detected — "
        "no in-place UUID ALTER; use scripts/pg_to_sqlite_uuid.py for cutover.",
        flush=True,
    )


def downgrade() -> None:
    pass
