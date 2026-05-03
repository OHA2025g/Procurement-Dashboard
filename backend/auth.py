"""Authentication utilities: JWT + bcrypt + RBAC."""
from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext

from models import Role, User

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_MINUTES = int(os.environ.get("JWT_EXPIRES_MINUTES", "720"))

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(password, hashed)
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str, department: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "department": department,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_EXPIRES_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[dict]:
    if not token:
        return None
    return decode_token(token)


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def require_roles(*allowed_roles: Role):
    """Dependency factory to require specific roles."""
    allowed = {r.value for r in allowed_roles}

    async def checker(user=Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed:
            raise HTTPException(status_code=403, detail=f"Access denied. Required roles: {', '.join(allowed)}")
        return user

    return checker


# Page-level access matrix
PAGE_ACCESS = {
    "executive": [Role.VIEWER, Role.MINISTER, Role.SECRETARY, Role.DEPT_HEAD,
                  Role.FINANCE_TEAM, Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    "statements": [Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM,
                   Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    "payment": [Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM, Role.SUPER_ADMIN],
    "tender": [Role.SECRETARY, Role.DEPT_HEAD, Role.SUPER_ADMIN],
    "backlog": [Role.SECRETARY, Role.DEPT_HEAD, Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    "risk": [Role.SECRETARY, Role.DEPT_HEAD, Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    "actions": [Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM,
                Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    "admin": [Role.SUPER_ADMIN],
    # Executive-style analytics views (same visibility as executive overview)
    "command_centre": [Role.VIEWER, Role.MINISTER, Role.SECRETARY, Role.DEPT_HEAD,
                       Role.FINANCE_TEAM, Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    "war_room": [Role.VIEWER, Role.MINISTER, Role.SECRETARY, Role.DEPT_HEAD,
                 Role.FINANCE_TEAM, Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    # Accountability / risk-style
    "department_accountability": [Role.SECRETARY, Role.DEPT_HEAD, Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    # Finance
    "finance_control": [Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM, Role.SUPER_ADMIN],
    # Pipeline / backlog-style
    "procurement_bottleneck": [Role.SECRETARY, Role.DEPT_HEAD, Role.AUDIT_TEAM, Role.SUPER_ADMIN],
    # Official decisions — align with action tracker visibility
    "official_decision_queue": [Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM,
                                  Role.AUDIT_TEAM, Role.SUPER_ADMIN],
}


def user_can_access_page(role: str, page: str) -> bool:
    allowed = PAGE_ACCESS.get(page, [])
    return any(r.value == role for r in allowed)
