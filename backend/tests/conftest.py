import sys
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TESTS_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
if str(TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(TESTS_ROOT))


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    from app import database

    path = tmp_path / "test.db"
    monkeypatch.setattr(database, "DB_PATH", path)
    database.init_db()
    return path


@pytest.fixture()
def conn(db_path):
    from app.database import get_conn

    with get_conn() as connection:
        yield connection
