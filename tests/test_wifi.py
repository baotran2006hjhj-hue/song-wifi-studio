import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from wifi_native import frequency_info, parse_ies
import server


class NativeParsingTests(unittest.TestCase):
    def test_frequencies(self):
        for freq, expected in [(2412000, ('2.4', 1)), (2484000, ('2.4', 14)),
                               (5180000, ('5', 36)), (5805000, ('5', 161)),
                               (5935000, ('6', 2)), (5955000, ('6', 1)), (7115000, ('6', 233))]:
            self.assertEqual(frequency_info(freq), expected)
        self.assertEqual(frequency_info(0), ('Other', None))

    def test_rsn_enterprise(self):
        body = bytes.fromhex('0100000fac040100000fac040100000fac010000')
        self.assertEqual(parse_ies(bytes([48, len(body)]) + body, True)[0], 'WPA2-Enterprise')

    def test_transition_security(self):
        body = bytes.fromhex('0100000fac040100000fac040200000fac02000fac080000')
        self.assertEqual(parse_ies(bytes([48, len(body)]) + body, True)[0], 'WPA2-Personal / WPA3-Personal')

    def test_truncated_beacon_is_bounded(self):
        self.assertEqual(parse_ies(b'\x30\xff\x00', True), ('Bảo mật (chưa rõ)', None))
        self.assertEqual(parse_ies(b''), ('Open', None))

    def test_width(self):
        self.assertEqual(parse_ies(bytes([61, 2, 36, 5]))[1], 40)
        self.assertEqual(parse_ies(bytes([192, 3, 1, 42, 0]))[1], 80)
        self.assertEqual(parse_ies(bytes([192, 3, 1, 42, 50]))[1], 160)


class LocalAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def test_health(self):
        with urlopen(self.base + '/api/health') as response:
            self.assertTrue(json.load(response)['ok'])

    def test_no_cors_and_local_token(self):
        with urlopen(self.base + '/api/state') as response:
            self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
            self.assertEqual(json.load(response)['token'], server.TOKEN)

    def test_cross_origin_rejected(self):
        req = Request(self.base + '/api/state', headers={'Origin': 'https://example.com'})
        with self.assertRaises(HTTPError) as caught: urlopen(req)
        self.assertEqual(caught.exception.code, 403)

    def test_dns_rebinding_host_rejected(self):
        req = Request(self.base + '/api/state', headers={'Host': 'attacker.example'})
        with self.assertRaises(HTTPError) as caught: urlopen(req)
        self.assertEqual(caught.exception.code, 403)

    def test_scan_requires_token(self):
        req = Request(self.base + '/api/scan', method='POST')
        with self.assertRaises(HTTPError) as caught: urlopen(req)
        self.assertEqual(caught.exception.code, 403)
        req = Request(self.base + '/api/scan', method='POST', headers={'X-Local-Token':server.TOKEN})
        with urlopen(req) as response: self.assertTrue(json.load(response)['ok'])

    def test_source_not_served(self):
        with self.assertRaises(HTTPError) as caught: urlopen(self.base + '/server.py')
        self.assertEqual(caught.exception.code, 404)


if __name__ == '__main__': unittest.main()
