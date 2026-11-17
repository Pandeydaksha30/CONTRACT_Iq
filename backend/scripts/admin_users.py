"""Manage accounts by hand, for a deployment without an email provider.

New users must confirm their email before they can sign in. Without SMTP nobody receives that
email, so an administrator confirms or creates accounts with this command instead.

Usage (from backend/, with NYAYASIM_DATABASE_URL pointing at the deployed database):
  python -m scripts.admin_users list
  python -m scripts.admin_users verify someone@example.com          # confirm a sign-up
  python -m scripts.admin_users create someone@example.com "Name"   # new account, confirmed
  python -m scripts.admin_users reset-password someone@example.com  # new password, signs out

`create` and `reset-password` generate a strong random password and print it ONCE; give it to the
person by a private channel and ask them to change it on the Account page. Passwords are stored
only as Argon2id hashes. Nothing here sends email.
"""

from __future__ import annotations

import secrets
import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.db.models import User, UserSession
from app.db.session import get_engine


def _new_password() -> str:
    return secrets.token_urlsafe(12) + "aA1!"


def _user(s: Session, email: str) -> User:
    user = s.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        raise SystemExit(f"error: no account with the email {email!r}")
    return user


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in {"list", "verify", "create", "reset-password"}:
        print(__doc__)
        return 2
    cmd, args = argv[0], argv[1:]
    with Session(get_engine()) as s:
        if cmd == "list":
            for u in s.scalars(select(User).order_by(User.created_at)):
                login = "password" if u.password_hash else "Google only"
                state = "confirmed" if u.email_verified else "NOT confirmed"
                print(f"{u.email:40} {state:14} {login:12} created {u.created_at:%Y-%m-%d}")
            return 0
        if not args:
            raise SystemExit(f"error: {cmd} needs an email address")
        email = args[0].strip().lower()
        if cmd == "verify":
            user = _user(s, email)
            user.email_verified = True
            s.commit()
            print(f"confirmed: {email}")
        elif cmd == "create":
            if s.scalar(select(User).where(User.email == email)) is not None:
                raise SystemExit(f"error: {email} already has an account (use verify or reset-password)")
            password = _new_password()
            s.add(
                User(
                    email=email,
                    name=(args[1] if len(args) > 1 else "").strip(),
                    password_hash=hash_password(password),
                    email_verified=True,
                )
            )
            s.commit()
            print(f"created and confirmed: {email}\npassword (shown once): {password}")
        else:  # reset-password
            user = _user(s, email)
            password = _new_password()
            user.password_hash = hash_password(password)
            user.failed_logins = 0
            user.locked_until = None
            s.execute(delete(UserSession).where(UserSession.user_id == user.id))
            s.commit()
            print(f"new password for {email} (shown once; all sessions signed out): {password}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
