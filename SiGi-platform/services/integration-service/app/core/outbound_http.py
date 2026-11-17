from __future__ import annotations

import ipaddress
import socket
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.core.settings import settings


class OutboundUrlPolicyError(RuntimeError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req: Request, fp: Any, code: int, msg: str, headers: Any, newurl: str):
        return None


def validate_outbound_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {'http', 'https'}:
        raise OutboundUrlPolicyError('Solo se permiten destinos HTTP(S).')
    if not parsed.hostname or parsed.username or parsed.password:
        raise OutboundUrlPolicyError('El destino debe tener host y no puede incluir credenciales.')

    host = parsed.hostname.rstrip('.').lower()
    if host in settings.outbound_http_allowed_hosts:
        return url

    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise OutboundUrlPolicyError(f'No fue posible resolver el destino {host}.') from exc

    if not addresses:
        raise OutboundUrlPolicyError(f'El destino {host} no resolvió direcciones.')
    for address in addresses:
        ip = ipaddress.ip_address(address.split('%', 1)[0])
        if not ip.is_global:
            raise OutboundUrlPolicyError(
                f'El destino {host} resuelve a una red privada o no enrutable.',
            )
    return url


def safe_urlopen(request: Request):
    """Open an outbound request after validating its destination and every redirect."""
    opener = build_opener(_NoRedirect())
    current = request
    for redirect_count in range(settings.outbound_http_max_redirects + 1):
        validate_outbound_url(current.full_url)
        try:
            response = opener.open(current, timeout=settings.http_client_timeout_ms / 1000)
        except HTTPError as exc:
            if exc.code not in {301, 302, 303, 307, 308}:
                raise
            location = exc.headers.get('Location')
            if not location or redirect_count >= settings.outbound_http_max_redirects:
                raise OutboundUrlPolicyError('El destino excedió el límite de redirecciones.') from exc
            target = urljoin(current.full_url, location)
            validate_outbound_url(target)
            method = current.get_method()
            data = current.data
            if exc.code == 303 or (exc.code in {301, 302} and method not in {'GET', 'HEAD'}):
                method, data = 'GET', None
            current = Request(target, data=data, headers=dict(current.header_items()), method=method)
            continue
        return response
    raise OutboundUrlPolicyError('El destino excedió el límite de redirecciones.')


def read_bounded(response: Any) -> bytes:
    payload = response.read(settings.outbound_http_max_response_bytes + 1)
    if len(payload) > settings.outbound_http_max_response_bytes:
        raise OutboundUrlPolicyError('La respuesta remota excede el tamaño permitido.')
    return payload
