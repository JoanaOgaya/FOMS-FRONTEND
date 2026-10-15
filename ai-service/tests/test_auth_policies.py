import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import policies
from app.constants.roles import DUPLICATE_CHECK_ROLES, Roles


def _request(headers: list[tuple[bytes, bytes]]) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/api/ai/duplicates",
        "headers": headers,
    })


def test_forwarded_financial_manager_role_is_canonicalized():
    request = _request([
        (b"x-user-role", b"Financial Manager"),
        (b"x-user-username", b"fm-user"),
    ])

    assert policies.get_current_user(request)["role"] == Roles.FINANCIAL_MANAGER.value


def test_direct_financial_manager_role_is_canonicalized(monkeypatch):
    monkeypatch.setattr(
        policies,
        "decode_and_validate",
        lambda token: {"sub": "fm-user", "role": "Financial Manager"},
    )
    request = _request([(b"authorization", b"Bearer valid-token")])

    assert policies.get_current_user(request)["role"] == Roles.FINANCIAL_MANAGER.value


def test_duplicate_alert_list_permission_accepts_canonical_financial_manager():
    role_checker = policies.require_roles(*DUPLICATE_CHECK_ROLES)

    payload = asyncio.run(role_checker(payload={"role": Roles.FINANCIAL_MANAGER.value}))

    assert payload["role"] == Roles.FINANCIAL_MANAGER.value


def test_unknown_forwarded_role_is_forbidden():
    request = _request([
        (b"x-user-role", b"Unknown Manager"),
        (b"x-user-username", b"user"),
    ])

    with pytest.raises(HTTPException) as exc:
        policies.get_current_user(request)

    assert exc.value.status_code == 403
