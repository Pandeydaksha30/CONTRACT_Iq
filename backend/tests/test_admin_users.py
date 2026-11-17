"""scripts/admin_users.py: confirm, create and reset accounts without email."""

from __future__ import annotations

import re

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.security import verify_password
from app.db.models import User
from scripts import admin_users


@pytest.fixture
def admin(db_engine, monkeypatch):
    monkeypatch.setattr(admin_users, "get_engine", lambda: db_engine)
    with db_engine.begin() as c:
        c.execute(text("DELETE FROM users WHERE email LIKE '%@admin-test.example'"))
    return admin_users.main


def _user(engine, email):
    with Session(engine) as s:
        return s.query(User).filter_by(email=email).one()


def test_create_verify_reset_and_list(admin, db_engine, capsys):
    assert admin(["create", "Reviewer@Admin-Test.example", "Dr Reviewer"]) == 0
    out = capsys.readouterr().out
    password = re.search(r"password \(shown once\): (\S+)", out).group(1)
    u = _user(db_engine, "reviewer@admin-test.example")
    assert u.email_verified and u.name == "Dr Reviewer" and verify_password(u.password_hash, password)
    assert password not in u.password_hash  # only the hash is stored

    with pytest.raises(SystemExit, match="already has an account"):
        admin(["create", "reviewer@admin-test.example"])

    with db_engine.begin() as c:
        c.execute(
            text(
                "UPDATE users SET email_verified = false, failed_logins = 7 "
                "WHERE email = 'reviewer@admin-test.example'"
            )
        )
    assert admin(["verify", "reviewer@admin-test.example"]) == 0
    assert _user(db_engine, "reviewer@admin-test.example").email_verified

    capsys.readouterr()
    assert admin(["reset-password", "reviewer@admin-test.example"]) == 0
    new = re.search(r"signed out\): (\S+)", capsys.readouterr().out).group(1)
    u = _user(db_engine, "reviewer@admin-test.example")
    assert verify_password(u.password_hash, new) and not verify_password(u.password_hash, password)
    assert u.failed_logins == 0

    assert admin(["list"]) == 0
    assert "reviewer@admin-test.example" in capsys.readouterr().out
    with pytest.raises(SystemExit, match="no account"):
        admin(["verify", "nobody@admin-test.example"])
    assert admin([]) == 2
