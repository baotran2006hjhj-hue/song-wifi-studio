# Kịch bản video giới thiệu Sóng — Wi‑Fi Studio

**Thời lượng gợi ý:** 4–5 phút. **Cách quay:** camera có mặt bạn trong suốt video hoặc đặt camera nhỏ ở góc; phần chính quay màn hình ứng dụng, phóng to chữ khi đọc số liệu. Đọc phần trong ngoặc vuông như chỉ dẫn, không cần đọc thành tiếng.

## 0:00–0:25 · Giới thiệu — nhìn vào camera

“Xin chào thầy/cô và các bạn. Mình là **[họ tên]**, **[mã sinh viên/lớp]**. Đây là **Sóng — Wi‑Fi Studio**, công cụ mình xây dựng để quan sát các mạng Wi‑Fi xung quanh, so sánh chất lượng tín hiệu, khảo sát tại từng vị trí và lập kế hoạch vùng phủ sóng.”

## 0:25–0:55 · Công cụ hoạt động thế nào — cho xem màn hình chính

“Ứng dụng chạy ngay trên máy Windows. Một dịch vụ Python nhỏ đọc thông tin Wi‑Fi mà Windows cung cấp cho card mạng, rồi trang web chạy trên địa chỉ localhost hiển thị kết quả. Dữ liệu quét không được gửi lên dịch vụ bên ngoài. Kết quả quét phụ thuộc card Wi‑Fi và trình điều khiển; Windows có thể đưa lại danh sách từ bộ nhớ đệm.”

## 0:55–1:35 · Khám phá mạng — bấm Quét ngay, sau đó Lọc FPT University

“Màn hình này liệt kê các điểm phát mà card Wi‑Fi phát hiện. Mình lọc theo tên FPT University. Các dòng cùng tên vẫn tách riêng vì mỗi dòng có một BSSID riêng: đó là mã của từng điểm phát hoặc radio. BSSID giúp phân biệt các điểm phát trùng tên; nó không phải mật khẩu và cũng không cho biết danh tính người đang dùng mạng.”

“Mình chọn một BSSID để theo dõi tín hiệu trên biểu đồ. Lựa chọn trong ứng dụng chỉ đổi phần dữ liệu đang xem, không đổi mạng mà máy tính đang kết nối.”

## 1:35–2:25 · Giải thích thông số — mở Chi tiết điểm phát

“SSID là tên mạng. RSSI là cường độ tín hiệu, đo bằng dBm. Vì các giá trị thường là số âm, −50 dBm mạnh hơn −75 dBm. Tín hiệu mạnh không tự đảm bảo Internet nhanh, vì tốc độ còn phụ thuộc số người dùng, thiết bị và đường truyền.”

“Băng tần cho biết vùng tần số: 2,4 GHz thường phủ xa hơn nhưng dễ đông; 5 GHz thường có nhiều lựa chọn kênh và băng thông tốt hơn ở cự ly gần; 6 GHz chỉ xuất hiện nếu card, driver, điểm phát và quy định khu vực hỗ trợ. Kênh là vị trí sóng dùng trong băng tần; các mạng cùng kênh hoặc kênh chồng lấn có thể cạnh tranh thời gian phát. Độ rộng kênh đo bằng MHz. Chuẩn PHY cho biết thế hệ Wi‑Fi mà driver báo, như 802.11n, ac, ax hay be.”

“Security cho biết kiểu bảo mật phát trong thông tin Wi‑Fi, ví dụ WPA2‑Enterprise. Ứng dụng không đọc hay hiện mật khẩu. Noise và SNR không có trong dữ liệu card cung cấp ở máy này nên mình để là không có dữ liệu thay vì ước đoán.”

## 2:25–3:00 · Biểu đồ và phân tích kênh

“Biểu đồ thể hiện các lần đọc RSSI theo thời gian. Mục Phân tích kênh giúp so sánh kênh của những điểm phát đã quét. Gợi ý kênh chỉ là so sánh mức chồng lấn tương đối từ các mạng nhìn thấy; nó không phải phép đo phổ RF hay phần trăm sử dụng của kênh. Muốn kết luận chính xác hơn cần thiết bị và driver đo chuyên dụng.”

## 3:00–3:40 · Khảo sát và lập kế hoạch

“Ở Khảo sát mặt bằng, mình tải bản đồ, chọn đúng BSSID, đi đến từng vị trí rồi bấm vị trí đó để ghi RSSI thực tế. Mỗi chấm là một lần đo; vùng màu là nội suy giữa những chấm gần nhau, không phải máy đã đo mọi điểm trong phòng.”

“Ở Lập kế hoạch, mình đặt điểm phát, nhập công suất và tỉ lệ mặt bằng, rồi vẽ tường để mô phỏng vùng tín hiệu. Đây là mô hình ước tính theo khoảng cách và suy hao mình chọn, chưa hiệu chuẩn theo kết cấu phòng hay loại anten. Cần khảo sát ngoài thực tế trước khi quyết định lắp đặt.”

## 3:40–4:15 · Chẩn đoán, lưu và kết luận — trở lại camera ở cuối

“Phần Chẩn đoán phân biệt RSSI với link rate RX/TX. Link rate là tốc độ liên kết giữa card và điểm phát; nó không phải tốc độ Internet. Bài kiểm tra tùy chọn đo thời gian mở kết nối TCP, không phải bài đo tốc độ tải xuống hay ping ICMP. Báo cáo có thể xuất CSV, lưu dự án JSON hoặc in ra PDF.”

“Đó là cách Sóng — Wi‑Fi Studio thu thập và trình bày thông tin Wi‑Fi, cùng ý nghĩa và giới hạn của từng thông số. Mã nguồn nằm ở liên kết GitHub trong phần mô tả video. Cảm ơn thầy/cô và các bạn đã theo dõi.”

## Checklist trước khi nộp

- Quay **có thấy mặt bạn** và giọng nói rõ; đặt camera picture‑in‑picture để vừa giải thích vừa thao tác.
- Trước khi quay, bật Wi‑Fi, mở `START.cmd`, vào `http://127.0.0.1:8765`.
- Bấm Quét ngay, dùng lọc FPT University, mở Chi tiết điểm phát, sau đó lần lượt vào Phân tích kênh, Khảo sát mặt bằng, Lập kế hoạch, Chẩn đoán và Báo cáo.
- Chỉ thêm mặt bằng được phép chia sẻ. Che mã BSSID nếu video công khai; tránh lộ thông tin đăng nhập, SSID cá nhân, vị trí/phòng học cụ thể, email hay tab trình duyệt riêng tư.
- Đọc số RSSI/bảo mật/kênh đúng giá trị đang hiện trên máy quay. Không đọc số ví dụ trong kịch bản như thể đó là kết quả đo.
- Dán URL repo GitHub thật vào phần mô tả bên dưới video sau khi repo được tạo.
