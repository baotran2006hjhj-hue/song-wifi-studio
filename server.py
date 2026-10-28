"""Loopback-only Wi-Fi Studio server. Python standard library, no installation needed."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from wifi_native import WifiReader

ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
WAKE = threading.Event()
STATE = {'networks': [], 'connections': [], 'adapters': [], 'warnings': [],
         'timestamp': None, 'error': None, 'scanning': True, 'history': {}, 'source': 'Windows Native Wi-Fi API'}


def scanner():
    reader = None
    while True:
        try:
            with LOCK: STATE['scanning'] = True
            if reader is None: reader = WifiReader()
            result = reader.scan()
            with LOCK:
                history = STATE['history']
                cutoff = time.time() - 3600
                for key in list(history):
                    history[key] = [p for p in history[key] if p['t'] >= cutoff]
                    if not history[key]: del history[key]
                for n in result['networks']:
                    history.setdefault(n['bssid'], []).append({'t': result['timestamp'], 'rssi': n['rssi']})
                    history[n['bssid']] = history[n['bssid']][-720:]
                STATE.update(result, error=None, scanning=False)
        except Exception as exc:
            with LOCK:
                STATE.update(error=str(exc), scanning=False, networks=[], connections=[])
            if reader:
                reader.close()
                reader = None
        WAKE.wait(5)
        WAKE.clear()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def log_message(self, format, *args):
        pass

    def trusted(self):
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in allowed: return False
        origin = self.headers.get('Origin')
        return not origin or origin in {f'http://{host}' for host in allowed}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
        super().end_headers()

    def json_response(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if not self.trusted(): return self.json_response({'error': 'Host không hợp lệ.'}, 403)
        path = urlsplit(self.path).path
        if path == '/api/state':
            with LOCK:
                payload = json.loads(json.dumps(STATE))
            payload['token'] = TOKEN
            payload['server_time'] = time.time()
            return self.json_response(payload)
        if path == '/api/health': return self.json_response({'ok': True, 'app': 'song-wifi-studio', 'version': '1.0.0'})
        if path.startswith('/api/'): return self.json_response({'error': 'Không tìm thấy.'}, 404)
        return super().do_GET()

    def do_POST(self):
        if not self.trusted() or self.headers.get('X-Local-Token') != TOKEN:
            return self.json_response({'error': 'Phiên cục bộ không hợp lệ. Hãy tải lại trang.'}, 403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.json_response({'error': 'Yêu cầu không hợp lệ.'}, 400)
        if length < 0 or length > 4096:
            return self.json_response({'error': 'Yêu cầu quá lớn.'}, 413)
        path = urlsplit(self.path).path
        if path == '/api/shutdown':
            self.json_response({'ok': True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if path == '/api/scan':
            WAKE.set()
            return self.json_response({'ok': True})
        if path == '/api/diagnostics':
            # Explicit UI action only. TCP connect time is not ICMP ping or throughput.
            results = []
            for host in ['1.1.1.1', '8.8.8.8']:
                samples, failures = [], 0
                for _ in range(3):
                    start = time.perf_counter()
                    try:
                        with socket.create_connection((host, 443), timeout=2):
                            samples.append(round((time.perf_counter() - start) * 1000, 1))
                    except OSError:
                        failures += 1
                results.append({'host': host, 'port': 443, 'samples_ms': samples,
                                'average_ms': round(sum(samples)/len(samples), 1) if samples else None,
                                'failed_attempts': failures, 'attempts': 3})
            return self.json_response({'results': results, 'timestamp': time.time(), 'method': 'TCP connect :443'})
        return self.json_response({'error': 'Không tìm thấy.'}, 404)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    threading.Thread(target=scanner, daemon=True).start()
    print(f'Wi-Fi Studio: http://127.0.0.1:{args.port}', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__ == '__main__': main()
