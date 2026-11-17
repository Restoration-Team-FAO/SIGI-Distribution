from __future__ import annotations

import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.core.settings import settings


def get_json(url: str, headers: dict[str, str] | None = None) -> bytes:
    request = Request(url, headers=headers or {})
    last_error: Exception | None = None

    for attempt in range(settings.http_client_max_retries + 1):
        try:
            with urlopen(request, timeout=settings.http_client_timeout_ms / 1000) as response:
                return response.read()
        except URLError as exc:
            last_error = exc
            if attempt >= settings.http_client_max_retries:
                break
            time.sleep(0.25 * (attempt + 1))

    raise RuntimeError(f'HTTP request failed after retries: {url}') from last_error
