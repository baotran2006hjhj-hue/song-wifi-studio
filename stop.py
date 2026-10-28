import json
import urllib.request

url = 'http://127.0.0.1:8765'
try:
    with urllib.request.urlopen(url + '/api/health', timeout=3) as response:
        if json.load(response).get('app') != 'song-wifi-studio':
            raise RuntimeError('Cong 8765 khong phai Wi-Fi Studio.')
    with urllib.request.urlopen(url + '/api/state', timeout=3) as response:
        token = json.load(response)['token']
    request = urllib.request.Request(url + '/api/shutdown', method='POST', headers={'X-Local-Token':token})
    with urllib.request.urlopen(request, timeout=3) as response:
        json.load(response)
    print('Da dung Wi-Fi Studio. Du an da luu trong trinh duyet van duoc giu.')
except Exception as exc:
    print('Khong co dich vu de dung, hoac khong ket noi duoc:', exc)
