import os
import pathlib
import sys
import unittest
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'postgresql://test:test@localhost/test')
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'services' / 'integration-service'))

from app.core.outbound_http import OutboundUrlPolicyError, validate_outbound_url
from app.core.settings import settings


class OutboundHttpPolicyTests(unittest.TestCase):
    def test_rejects_credentials_and_non_http_schemes(self):
        with self.assertRaises(OutboundUrlPolicyError):
            validate_outbound_url('file:///etc/passwd')
        with self.assertRaises(OutboundUrlPolicyError):
            validate_outbound_url('https://user:secret@example.org/data')

    @patch('app.core.outbound_http.socket.getaddrinfo')
    def test_rejects_ipv4_and_ipv6_non_global_destinations(self, getaddrinfo):
        getaddrinfo.return_value = [(2, 1, 6, '', ('127.0.0.1', 80))]
        with self.assertRaises(OutboundUrlPolicyError):
            validate_outbound_url('http://localhost/data')
        getaddrinfo.return_value = [(10, 1, 6, '', ('fe80::1', 80, 0, 0))]
        with self.assertRaises(OutboundUrlPolicyError):
            validate_outbound_url('http://metadata.internal/data')

    @patch('app.core.outbound_http.socket.getaddrinfo')
    def test_accepts_only_global_dns_answers(self, getaddrinfo):
        getaddrinfo.return_value = [(2, 1, 6, '', ('8.8.8.8', 443))]
        self.assertEqual(validate_outbound_url('https://example.org/data'), 'https://example.org/data')

    def test_explicit_allowlist_supports_a_governed_private_connector(self):
        original = settings.outbound_http_allowed_hosts
        try:
            settings.outbound_http_allowed_hosts = {'odoo.internal'}
            self.assertEqual(validate_outbound_url('https://odoo.internal'), 'https://odoo.internal')
        finally:
            settings.outbound_http_allowed_hosts = original


if __name__ == '__main__':
    unittest.main()
