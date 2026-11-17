from __future__ import annotations

import json
import time
from threading import Lock

from fastapi import Request


_metrics = {
    'http_requests_total': 0,
    'http_requests_in_flight': 0,
}
_metrics_lock = Lock()


def increment_requests() -> None:
    with _metrics_lock:
        _metrics['http_requests_total'] += 1
        _metrics['http_requests_in_flight'] += 1


def complete_request() -> None:
    with _metrics_lock:
        _metrics['http_requests_in_flight'] = max(0, _metrics['http_requests_in_flight'] - 1)


def render_metrics() -> str:
    with _metrics_lock:
        total = _metrics['http_requests_total']
        inflight = _metrics['http_requests_in_flight']

    return '\n'.join([
        '# HELP http_requests_total Total HTTP requests handled by the service',
        '# TYPE http_requests_total counter',
        f'http_requests_total {total}',
        '# HELP http_requests_in_flight Current in-flight HTTP requests',
        '# TYPE http_requests_in_flight gauge',
        f'http_requests_in_flight {inflight}',
    ])


def log_startup_event(service_name: str, log_level: str, timeout_ms: int, max_retries: int) -> None:
    print(json.dumps({
        'event': 'startup_config',
        'service': service_name,
        'logLevel': log_level,
        'httpClientTimeoutMs': timeout_ms,
        'httpClientMaxRetries': max_retries,
    }))


async def log_request(request: Request, call_next):
    started_at = time.perf_counter()
    increment_requests()

    try:
        response = await call_next(request)
    finally:
        complete_request()

    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    print(json.dumps({
        'event': 'http_request',
        'service': request.app.title,
        'method': request.method,
        'path': request.url.path,
        'statusCode': response.status_code,
        'durationMs': duration_ms,
    }))
    return response
