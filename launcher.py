"""Open existing instance, otherwise start a foreground service for START.cmd."""
import json
import threading
import urllib.request
import webbrowser
import server

URL = 'http://127.0.0.1:8765'

if __name__ == '__main__':
    existing = False
    try:
        with urllib.request.urlopen(URL + '/api/health', timeout=2) as response:
            existing = json.load(response).get('app') == 'song-wifi-studio'
    except Exception:
        pass
    if existing:
        print('Wi-Fi Studio dang chay. Dang mo ung dung...')
        webbrowser.open(URL)
    else:
        threading.Timer(1.2, lambda: webbrowser.open(URL)).start()
        server.main()
