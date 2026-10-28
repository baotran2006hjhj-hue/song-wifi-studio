"""Read-only Windows Native Wi-Fi adapter. No passwords, profiles or disconnects."""
import ctypes as C
import os
import time
import threading

U32 = C.c_uint32
I32 = C.c_int32
U16 = C.c_uint16
U8 = C.c_ubyte


class GUID(C.Structure):
    _fields_ = [('data', U8 * 16)]


class SSID(C.Structure):
    _fields_ = [('length', U32), ('data', U8 * 32)]


class Interface(C.Structure):
    _fields_ = [('guid', GUID), ('description', C.c_wchar * 256), ('state', U32)]


class Rates(C.Structure):
    _fields_ = [('length', U32), ('rates', U16 * 126)]


class BSS(C.Structure):
    _fields_ = [('ssid', SSID), ('phy_id', U32), ('mac', U8 * 6),
                ('bss_type', U32), ('phy_type', U32), ('rssi', I32),
                ('quality', U32), ('in_reg', U8), ('beacon', U16),
                ('timestamp', C.c_uint64), ('host_timestamp', C.c_uint64),
                ('capabilities', U16), ('frequency', U32), ('rates', Rates),
                ('ie_offset', U32), ('ie_size', U32)]


class Association(C.Structure):
    _fields_ = [('ssid', SSID), ('bss_type', U32), ('mac', U8 * 6),
                ('phy_type', U32), ('phy_index', U32), ('quality', U32),
                ('rx', U32), ('tx', U32)]


class Security(C.Structure):
    _fields_ = [('enabled', I32), ('one_x', I32), ('auth', U32), ('cipher', U32)]


class Connection(C.Structure):
    _fields_ = [('state', U32), ('mode', U32), ('profile', C.c_wchar * 256),
                ('association', Association), ('security', Security)]


class Notification(C.Structure):
    _fields_ = [('source', U32), ('code', U32), ('guid', GUID), ('size', U32), ('data', C.c_void_p)]


PHY = {1: 'FHSS', 2: 'DSSS', 4: '802.11a', 5: '802.11b', 6: '802.11g',
       7: '802.11n', 8: '802.11ac', 9: '802.11ad', 10: '802.11ax', 11: '802.11be'}
AUTH = {1: 'Open', 2: 'Shared key', 3: 'WPA-Enterprise', 4: 'WPA-Personal',
        6: 'WPA2-Enterprise', 7: 'WPA2-Personal', 8: 'WPA3-Enterprise',
        9: 'WPA3-Personal', 10: 'OWE', 11: 'WPA3-Enterprise', 12: 'WPA3-Enterprise'}


def ssid_text(value):
    return bytes(value.data[:min(value.length, 32)]).decode('utf-8', 'replace')


def mac_text(value):
    return ':'.join(f'{b:02X}' for b in value)


def frequency_info(khz):
    mhz = khz / 1000
    if mhz == 2484:
        return '2.4', 14
    if 2412 <= mhz <= 2472:
        return '2.4', round((mhz - 2407) / 5)
    if mhz == 5935:
        return '6', 2
    if 5955 <= mhz <= 7115:
        return '6', round((mhz - 5950) / 5)
    if 5000 <= mhz < 5925:
        return '5', round((mhz - 5000) / 5)
    return 'Other', None


def parse_ies(data, privacy=False):
    """Parse bounded beacon IEs; unknown fields stay unknown, never inferred noise."""
    elements = []
    i = 0
    while i + 2 <= len(data):
        tag, size = data[i:i+2]
        if i + 2 + size > len(data):
            break
        elements.append((tag, data[i+2:i+2+size]))
        i += 2 + size
    security = 'Bảo mật (chưa rõ)' if privacy else 'Open'
    width = None
    for tag, body in elements:
        if tag == 48 and len(body) >= 8:
            try:
                pair_count = int.from_bytes(body[6:8], 'little')
                pos = 8 + 4 * pair_count
                count = int.from_bytes(body[pos:pos+2], 'little')
                if pos + 2 + count * 4 > len(body):
                    continue
                akms = {body[pos+2+j*4+3] for j in range(count)
                        if body[pos+2+j*4:pos+2+j*4+3] == b'\x00\x0f\xac'}
                labels = []
                if akms & {1, 3, 5}: labels.append('WPA2-Enterprise')
                if akms & {2, 4, 6}: labels.append('WPA2-Personal')
                if akms & {8, 9}: labels.append('WPA3-Personal')
                if akms & {11, 12, 13}: labels.append('WPA3-Enterprise')
                if 18 in akms: labels.append('OWE')
                security = ' / '.join(labels) or 'RSN'
            except (IndexError, ValueError):
                security = 'RSN'
        elif tag == 221 and body.startswith(b'\x00\x50\xf2\x01') and security in ('Open', 'Bảo mật (chưa rõ)'):
            security = 'WPA'
        elif tag == 61 and len(body) >= 2:
            width = 40 if body[1] & 4 and body[1] & 3 else 20
        elif tag == 192 and len(body) >= 3:
            if body[0] == 1:
                width = 160 if body[2] and abs(body[2] - body[1]) == 8 else ('80+80' if body[2] else 80)
            elif body[0] == 2: width = 160
            elif body[0] == 3: width = '80+80'
    return security, width


def error_message(code):
    if code == 5:
        return 'Windows chưa cấp quyền đọc Wi-Fi. Bật Settings → Privacy & security → Location → Location services và quyền vị trí cho ứng dụng desktop, rồi mở lại bằng START.cmd ngoài môi trường giới hạn.'
    if code == 1062:
        return 'Dịch vụ WLAN AutoConfig chưa chạy. Bật Wi-Fi và kiểm tra dịch vụ WLAN AutoConfig trong Windows.'
    if code == 5023:
        return 'Card Wi-Fi chưa sẵn sàng. Kiểm tra Wi-Fi, chế độ máy bay và driver.'
    return f'Windows Wi-Fi API trả mã {code}. Kiểm tra card Wi-Fi và quyền truy cập.'


class WifiReader:
    def __init__(self):
        self.handle = C.c_void_p()
        if os.name != 'nt':
            raise RuntimeError('Quét Wi-Fi thật hiện chỉ hỗ trợ Windows.')
        self.dll = C.WinDLL('wlanapi.dll')
        signatures = {
            'WlanOpenHandle': [U32, C.c_void_p, C.POINTER(U32), C.POINTER(C.c_void_p)],
            'WlanEnumInterfaces': [C.c_void_p, C.c_void_p, C.POINTER(C.c_void_p)],
            'WlanScan': [C.c_void_p, C.POINTER(GUID), C.c_void_p, C.c_void_p, C.c_void_p],
            'WlanGetNetworkBssList': [C.c_void_p, C.POINTER(GUID), C.c_void_p, U32, I32, C.c_void_p, C.POINTER(C.c_void_p)],
            'WlanQueryInterface': [C.c_void_p, C.POINTER(GUID), U32, C.c_void_p, C.POINTER(U32), C.POINTER(C.c_void_p), C.POINTER(U32)],
            'WlanCloseHandle': [C.c_void_p, C.c_void_p],
            'WlanFreeMemory': [C.c_void_p],
        }
        for name, args in signatures.items():
            fn = getattr(self.dll, name)
            fn.argtypes = args
            fn.restype = None if name == 'WlanFreeMemory' else U32
        version = U32()
        code = self.dll.WlanOpenHandle(2, None, C.byref(version), C.byref(self.handle))
        if code:
            raise RuntimeError(error_message(code))
        self.scan_events = {}
        callback_type = C.WINFUNCTYPE(None, C.POINTER(Notification), C.c_void_p)
        def on_notification(ptr, context):
            try:
                notice = ptr.contents
                if notice.source == 8 and notice.code in (7, 8):
                    event = self.scan_events.get(bytes(notice.guid.data))
                    if event: event.set()
            except Exception:
                pass
        self.callback = callback_type(on_notification)
        self.dll.WlanRegisterNotification.argtypes = [C.c_void_p, U32, I32, callback_type, C.c_void_p, C.c_void_p, C.POINTER(U32)]
        self.dll.WlanRegisterNotification.restype = U32
        previous = U32()
        self.notifications_enabled = self.dll.WlanRegisterNotification(self.handle, 8, False, self.callback, None, None, C.byref(previous)) == 0

    def close(self):
        if self.handle.value:
            self.dll.WlanCloseHandle(self.handle, None)
            self.handle = C.c_void_p()

    def interfaces(self):
        ptr = C.c_void_p()
        code = self.dll.WlanEnumInterfaces(self.handle, None, C.byref(ptr))
        if code: raise RuntimeError(error_message(code))
        try:
            count = U32.from_address(ptr.value).value
            if count > 64: raise RuntimeError('Danh sách card Wi-Fi không hợp lệ.')
            return [Interface.from_buffer_copy(C.string_at(ptr.value + 8 + i * C.sizeof(Interface), C.sizeof(Interface))) for i in range(count)]
        finally:
            self.dll.WlanFreeMemory(ptr)

    def connection(self, iface):
        ptr, size, kind = C.c_void_p(), U32(), U32()
        code = self.dll.WlanQueryInterface(self.handle, C.byref(iface.guid), 7, None, C.byref(size), C.byref(ptr), C.byref(kind))
        if code: return None
        try:
            if size.value < C.sizeof(Connection): return None
            value = Connection.from_address(ptr.value)
            a = value.association
            return {'ssid': ssid_text(a.ssid), 'bssid': mac_text(a.mac),
                    'quality': a.quality, 'rx_mbps': a.rx / 1000, 'tx_mbps': a.tx / 1000,
                    'security': AUTH.get(value.security.auth, 'Chưa rõ'), 'adapter': iface.description}
        finally:
            self.dll.WlanFreeMemory(ptr)

    def scan(self):
        interfaces = self.interfaces()
        if not interfaces:
            raise RuntimeError('Không tìm thấy card Wi-Fi. Cần card Wi-Fi hoạt động; kết nối Ethernet không đủ để quét.')
        warnings, networks, connections = [], {}, []
        self.scan_events = {bytes(iface.guid.data): threading.Event() for iface in interfaces}
        for iface in interfaces:
            code = self.dll.WlanScan(self.handle, C.byref(iface.guid), None, None, None)
            if code:
                warnings.append(error_message(code))
                self.scan_events[bytes(iface.guid.data)].set()
        # Read after Windows reports scan completion, instead of displaying a partial scan.
        if self.notifications_enabled:
            deadline = time.monotonic() + 6
            for event in self.scan_events.values():
                event.wait(max(0, deadline - time.monotonic()))
            if any(not event.is_set() for event in self.scan_events.values()):
                warnings.append('Driver chưa báo quét xong; đang hiển thị bộ nhớ đệm Wi-Fi hiện có.')
        else:
            time.sleep(4)
        for iface in interfaces:
            connection = self.connection(iface)
            if connection: connections.append(connection)
            ptr = C.c_void_p()
            code = self.dll.WlanGetNetworkBssList(self.handle, C.byref(iface.guid), None, 3, False, None, C.byref(ptr))
            if code:
                warnings.append(error_message(code))
                continue
            try:
                total = U32.from_address(ptr.value).value
                count = U32.from_address(ptr.value + 4).value
                if total < 8 or count > 10000 or 8 + count * C.sizeof(BSS) > total:
                    warnings.append('Dữ liệu card Wi-Fi không hợp lệ.')
                    continue
                for i in range(count):
                    address = ptr.value + 8 + i * C.sizeof(BSS)
                    entry = BSS.from_address(address)
                    raw = b''
                    start = address + entry.ie_offset
                    if entry.ie_size <= 65536 and start >= address + C.sizeof(BSS) and start + entry.ie_size <= ptr.value + total:
                        raw = C.string_at(start, entry.ie_size)
                    security, width = parse_ies(raw, bool(entry.capabilities & 16))
                    band, channel = frequency_info(entry.frequency)
                    bssid = mac_text(entry.mac)
                    current = connection is not None and connection['bssid'] == bssid
                    if current: security = connection['security']
                    rate_count = min(entry.rates.length, 126)
                    rates = [(r & 0x7FFF) / 2 for r in entry.rates.rates[:rate_count]]
                    item = {'ssid': ssid_text(entry.ssid), 'bssid': bssid, 'rssi': entry.rssi,
                            'quality': entry.quality, 'frequency': entry.frequency / 1000,
                            'band': band, 'channel': channel, 'width': width, 'security': security,
                            'phy': PHY.get(entry.phy_type, f'PHY {entry.phy_type}'),
                            'legacy_rate_mbps': max(rates, default=None), 'connected': current,
                            'adapter': iface.description, 'noise': None, 'snr': None,
                            'seen_at': time.time(), 'source': 'Windows WLAN'}
                    if bssid not in networks or item['rssi'] > networks[bssid]['rssi']:
                        networks[bssid] = item
                    elif current:
                        networks[bssid]['connected'] = True
            finally:
                self.dll.WlanFreeMemory(ptr)
        return {'networks': sorted(networks.values(), key=lambda n: n['rssi'], reverse=True),
                'connections': connections, 'adapters': [i.description for i in interfaces],
                'warnings': list(dict.fromkeys(warnings)), 'timestamp': time.time(),
                'source': 'Windows Native Wi-Fi API', 'scan_note': 'Windows có thể trả bộ nhớ đệm từ driver; không phải mọi lần đọc đều là một phép đo RF mới.'}
