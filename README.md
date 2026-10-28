# Sóng — Wi-Fi Studio

Kịch bản quay video tiếng Việt: [VIDEO-SCRIPT-VI.md](VIDEO-SCRIPT-VI.md). Mẫu mô tả video có chỗ để dán link GitHub thật: [VIDEO-DESCRIPTION-VI.md](VIDEO-DESCRIPTION-VI.md).

Ứng dụng Wi-Fi chạy trên localhost, giao diện tiếng Việt, dữ liệu từ Windows Native Wi-Fi API. Đây là ứng dụng độc lập, **không phải bản sao đầy đủ của NetSpot**.

## Mở ứng dụng

1. Bật Wi-Fi trên Windows (máy có card Wi-Fi; không cần rời mạng đang kết nối).
2. Nhấp đúp `START.cmd` trong thư mục này.
3. Mở **http://127.0.0.1:8765**. Giữ cửa sổ dịch vụ mở trong lúc dùng; Ctrl+C để dừng.

Nếu ứng dụng đang chạy, `START.cmd` mở lại phiên sẵn có. Dùng `STOP.cmd` để dừng dịch vụ trên cổng mặc định, kể cả khi dịch vụ đang chạy ẩn. Dự án đã lưu trong trình duyệt vẫn được giữ.

Cần Python 3.10 trở lên, không cần cài thư viện ngoài. Máy hiện tại đã có Python 3.14. Có thể chạy thủ công `python server.py --port 8765`; nếu cổng đã dùng, chọn cổng khác. Đợi vài giây cho lần quét đầu. Nếu START mở trình duyệt trước khi server khởi động, tải lại trang.

## Chức năng

- Quét thật qua `wlanapi.dll`: SSID, BSSID, RSSI, quality, tần số, băng tần, kênh, PHY, bảo mật và độ rộng kênh khi giải mã được từ beacon.
- Kết nối hiện tại, card Wi-Fi, RX/TX link rate; không đọc mật khẩu hay thay đổi cấu hình mạng.
- Lọc FPT University một chạm, tìm SSID/BSSID, lọc băng tần/bảo mật, sắp xếp, chọn từng BSSID, xem chi tiết.
- Biểu đồ tín hiệu 2/5/30/60 phút; lịch sử trong RAM tối đa 1 giờ. Tạm dừng màn hình không dừng dịch vụ thu thập.
- Biểu đồ kênh 2.4/5/6 GHz và xếp hạng chồng lấn tương đối.
- Khảo sát: tải ảnh mặt bằng, chọn BSSID, đến vị trí thật rồi bấm để lưu dữ liệu lượt đọc mới nhất. Heatmap nội suy IDW khi có ít nhất 3 điểm, chỉ tô vùng gần điểm đo.
- Lập kế hoạch: đặt và kéo AP, chọn băng tần/công suất, nhập chiều rộng toàn khung ảnh, hệ số suy hao, vẽ tường bằng 2 lần bấm, xóa và hoàn tác.
- Chẩn đoán kết nối và bài thử TCP tùy chọn đến 1.1.1.1:443 / 8.8.8.8:443 (3 lần mỗi đích).
- CSV theo bộ lọc, JSON lịch sử, dự án JSON chứa mặt bằng/điểm đo/AP/tường, in/lưu PDF bằng trình duyệt.
- Tự lưu dự án trong localStorage của trình duyệt. Đổi trình duyệt/hostname/port sẽ dùng kho lưu khác; xuất JSON để chuyển dữ liệu.

## Khác biệt và giới hạn

- Không có sniffing/monitor mode, giải mã mật khẩu, danh sách client từ router, đo phổ RF, đo nhiễu nền/SNR, hay bài đo throughput Internet. Không bịa các thông số chưa đọc được.
- Scan đọc cache do Windows/driver quản lý. Windows có thể trả một phần danh sách trong lúc scan, hoặc giữ các BSSID cũ. Cột thời gian là thời gian ứng dụng đọc dữ liệu, không khẳng định một phép đo RF hoàn toàn mới.
- Độ rộng kênh giải mã HT/VHT, chưa giải mã đầy đủ HE/EHT; chưa hỗ trợ tính chính xác vị trí kênh phụ/center segment cho mọi mạng 80/160/320 MHz. Đồ thị chồng lấn chỉ là minh họa, không phải máy phân tích phổ.
- Băng 6 GHz chỉ có khi card, driver và vùng hỗ trợ. Realtek 8852BE trên máy này không được mặc định coi là card 6E.
- RSSI là tín hiệu; link rate không phải tốc độ Internet. TCP connect time không phải ICMP ping, packet loss hay bandwidth test.
- Heatmap khảo sát là nội suy giữa các điểm, không đo xuyên tường. Bản đồ lập kế hoạch dùng log-distance: `Pr = Pt - FSPL(1m,f) - 10*n*log10(distance) - tổng suy hao tường giao cắt`. Không hiệu chuẩn theo vật liệu/antenna/thực địa, không thay thế thiết kế RF chuyên nghiệp.
- Tỷ lệ bao phủ tính trên toàn hình chữ nhật của ảnh, kể cả viền trắng; ảnh tải vào giữ tỉ lệ và được đặt giữa khung 1200×720. Nhập chiều rộng toàn khung này, không chỉ phòng bên trong ảnh.
- Không có cơ sở dữ liệu hãng sản xuất OUI đi kèm; không suy đoán hãng/model từ MAC ngẫu nhiên.
- Tính năng tải dự án có giới hạn: 5.000 điểm đo, 200 AP, 500 tường, tệp 14 MB. Để hiệu năng tốt nên dùng ít hơn 20 AP và 50 tường.

## Quyền Wi-Fi Windows

Nếu báo Access denied / mã 5:

1. Mở Windows Settings → Privacy & security → Location.
2. Bật Location services và quyền vị trí cho ứng dụng desktop nếu Windows yêu cầu.
3. Chạy `START.cmd` bằng phiên Windows của bạn (không chạy trong sandbox không có quyền WLAN).

Không cần tắt tường lửa hoặc tắt bảo mật. Nếu không có card, bật WLAN AutoConfig và kiểm tra driver/chế độ máy bay. Dịch vụ chỉ lắng nghe `127.0.0.1`, không công khai lên LAN hay Internet.

## Dữ liệu và bảo vệ cục bộ

Không dùng CDN, font từ xa, analytics hay dịch vụ cloud. Wi-Fi API chỉ đọc metadata; không truy xuất profile/mật khẩu. Lệnh quét chủ động sử dụng hành vi thông thường của Windows, không ngắt kết nối. Dữ liệu mạng ở RAM của server; dự án lưu trong trình duyệt hoặc file bạn xuất. Bài kiểm tra TCP chỉ chạy khi bấm nút. API kiểm tra Host/Origin và token phiên cho POST; không bật CORS. Báo cáo CSV chặn công thức bắt đầu bằng ký tự đặc biệt từ SSID.

## Kiểm tra

`python -m unittest discover -s tests -v`

`node --check web/app.js`

`node tests/frontend.test.cjs`

Kiểm thử tự động bao gồm ánh xạ kênh, bảo mật RSN, beacon bị cắt ngắn, giới hạn API loopback và xác thực POST. Kiểm thử card thật và trình duyệt cần Windows với quyền đọc WLAN.
