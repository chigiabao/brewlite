# BrewLite – Tóm tắt công việc A–G

Theo bộ tài liệu GUIDE-V2 A–G. BrewLite là ứng dụng đặt cà phê: xem menu → chọn món → giỏ hàng → đăng nhập → tạo đơn → thanh toán → xác nhận và xem lịch sử.

| Người / thành phần | Làm gì? | Kết quả cần có |
|---|---|---|
| **A – Platform / Integration** | Chuẩn bị môi trường, Docker, CI; thống nhất API/schema dùng chung; review và ghép code các thành viên. | Cả hệ thống chạy từ repo sạch, kiểm thử tích hợp đạt, có README và bản demo/bàn giao. |
| **B – Catalog** | Làm API danh sách/chi tiết sản phẩm, dữ liệu mẫu, giao diện menu và chi tiết; chọn size/topping và thêm vào giỏ. | Người dùng xem được món, giá, ảnh; chọn cấu hình món và đưa vào giỏ của C. |
| **C – Cart** | Làm giỏ hàng bằng Zustand: thêm/xóa món, đổi số lượng, tính tổng hiển thị, badge và lưu giỏ trên trình duyệt. | Giỏ tính đúng, phân biệt size/topping, tải lại trang không mất và chuyển được sang checkout. |
| **D – Identity** | Làm đăng ký/đăng nhập, băm mật khẩu, cấp/kiểm tra JWT, Guard và giao diện xác thực. | Người dùng đăng nhập được; API cần đăng nhập từ chối token thiếu/sai/hết hạn. |
| **E – Ordering** | Tạo/đọc đơn và lịch sử; tính giá lại từ DB, lưu giá tại lúc đặt; quản lý trạng thái, tồn kho và chống tạo đơn lặp. | Đơn đúng giá, đúng chủ; đặt đồng thời không vượt kho; gửi lại cùng yêu cầu không tạo thêm đơn. |
| **F – Payments** | Làm thanh toán giả lập Ví/Thẻ, checkout, xác nhận/lịch sử trên giao diện; chống thanh toán lặp và xử lý thử lại. | Thành công → PAID và xóa giỏ; thất bại → giữ giỏ, thử lại trên cùng đơn; gửi lặp không thu hai lần. |
| **G – Rewards** | Làm kiểm tra mã giảm giá, tính ưu đãi, số dư điểm; giữ lượt dùng mã/điểm khi đặt đơn và ghi nhận điểm sau thanh toán. | Mã hợp lệ giảm đúng; không vượt quota/âm điểm; điểm thưởng chỉ cộng một lần khi đơn PAID. |

## Các phần nối với nhau thế nào?

- **B → C:** B hiển thị nút thêm món; C lưu và quản lý giỏ.
- **D → E/F/G:** D cung cấp danh tính người đăng nhập; từng module kiểm tra quyền với dữ liệu của mình.
- **C/F → E:** Gửi món và số lượng; E tính tiền chính thức từ DB và tạo đơn.
- **E → G:** Giữ quota coupon/điểm trong cùng giao dịch tạo đơn và giữ tồn kho.
- **F → E/G/C:** Thanh toán thành công thì cập nhật trạng thái đơn qua E, ghi nhận điểm qua G và xóa giỏ qua C.
- **A:** Giữ các phần dùng chung thống nhất, ghép module và kiểm tra toàn bộ luồng.

## Những điểm cả nhóm phải nhớ

- Giá trên giao diện chỉ để xem; **E quyết định giá chính thức**.
- Thêm vào giỏ chưa trừ tồn kho; **E xử lý tồn kho lúc tạo đơn**.
- **E** quản lý trạng thái đơn; **F** quản lý thanh toán; **G** quản lý coupon/điểm.
- Kiểm tra coupon chỉ là xem trước; giữ quota/điểm diễn ra khi tạo đơn.
- Khi chưa biết kết quả thanh toán do lỗi mạng, thử lại với khóa cũ; sau khi bị từ chối rõ ràng, lần thanh toán mới dùng khóa mới trên cùng đơn.
- Mỗi người bàn giao code, hướng dẫn và bằng chứng kiểm thử phần mình; A kiểm tra tích hợp.
