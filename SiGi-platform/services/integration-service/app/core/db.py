from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

from app.core.settings import settings


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(settings.database_url, row_factory=dict_row) as connection:
        yield connection


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return list(cursor.fetchall())


def execute(query: str, params: tuple[Any, ...] = ()) -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
        connection.commit()


def execute_returning(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
        connection.commit()

    if row is None:
        raise RuntimeError('Expected a row to be returned from the database')

    return row


def dumps_json(value: dict[str, Any] | None) -> str:
    return json.dumps(value or {})
