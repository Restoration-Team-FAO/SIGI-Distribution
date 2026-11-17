from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, status

from app.core.settings import settings


def require_internal_service_auth(
    authorization: str | None = Header(default=None),
) -> None:
    expected = settings.internal_service_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Internal service auth is not configured',
        )

    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Missing internal bearer token',
        )

    token = authorization[len('Bearer ') :].strip()
    if not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Invalid internal bearer token',
        )
