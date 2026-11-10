# Brewlite — kiểm thử admin và user, 03/11/2026

## Kết luận

Các luồng chính chạy được với thanh toán MOCK, nhưng chưa thể kết luận ứng dụng đạt toàn bộ kiểm thử. Có 7 phát hiện cần xử lý hoặc rà soát, trong đó sửa sản phẩm và VNPay đang chặn luồng sử dụng.

Kiểm thử trực tiếp bằng trình duyệt hiển thị trên máy, tại `http://localhost:3000`, API `http://localhost:3001`, stack Docker đang chạy. Dùng admin `customer@gmail.com` theo thông tin người dùng cung cấp và khách hàng `demo@gmail.com`. Không lưu mật khẩu hoặc JWT trong báo cáo.

Backend E2E chạy với database riêng `brewlite_qa_20261103`, migrate và seed mới. Các suite dùng ID cố định không chạy trên database ứng dụng đang dùng. Các thao tác UI chạy trên database local hiện tại. Không chỉnh sửa mã nguồn hoặc cấu hình để che lỗi khi test.

## Các phát hiện

| ID | Mức độ | Kết quả quan sát | Tái hiện / nguyên nhân |
|---|---|---|---|
| UI-01 | P1 | Không lưu được chỉnh sửa sản phẩm; hiện `Failed to fetch`, modal vẫn mở. | Admin → Thực đơn & Kho → Matcha Latte → Chỉnh sửa → Cập nhật món. Frontend dùng PUT trong `frontend/lib/admin-api.ts`; `backend/src/main.ts:27` thiếu PUT trong CORS. OPTIONS thực tế cũng chỉ trả `GET,POST,PATCH,DELETE,OPTIONS`. Các trường nhập đều hợp lệ. |
| UI-02 | P1 | VNPay Sandbox báo **Không tìm thấy website**, URL kết thúc bằng `Payment/Error.html?code=72`. | User đặt Trà đào S, chọn VNPay. Đơn #137 được tạo nhưng không thanh toán xong. Sau khi quay lại lịch sử, hủy đơn báo đang có giao dịch thanh toán. Cần rà soát cấu hình merchant sandbox và khả năng kết thúc giao dịch lỗi. Chưa xác định nguyên nhân từ phía VNPay chỉ bằng thông báo này. |
| UI-03 | P2 | Banner quảng cáo BREWNEW giảm 15%, checkout báo không tìm thấy mã. | Giỏ 110.000đ, nhập BREWNEW và Áp dụng. Database chỉ có GIAM10, GIAM15K, HET_HAN; quảng cáo không khớp dữ liệu đang chạy. |
| UI-04 | P2 | Dashboard ghi **Đơn hàng cao nhất: 500.000đ** dù không có đơn tương ứng. | `frontend/app/admin/page.tsx:293` lấy `Math.max(...doanhThuTheoNgay, 500000)` làm trần biểu đồ, rồi hiển thị giá trị đó như đơn cao nhất. Khi đối chiếu DB, đơn lớn nhất trong toàn bộ 6 đơn là 145.000đ, còn đơn lớn nhất đã thanh toán là 99.000đ. |
| UI-05 | P2 | Thống kê **Đã phục vụ / Top món bán chạy** tính cả đơn hủy và chưa thanh toán. | Dashboard hiển thị Cà phê sữa 7 ly, trong đó 2 ly thuộc đơn #134 CANCELLED; Cappuccino 1 ly cũng thuộc đơn #134; Trà đào 1 ly thuộc #137 PENDING. `backend/src/admin/admin.service.ts` lấy/groupBy OrderItem không lọc trạng thái Order cho các thống kê này. |
| UI-06 | P2 | Header storefront ở mobile không có đường vào lịch sử đơn hoặc menu điều hướng thay thế. | Viewport 390×844: chỉ thấy logo, giỏ, avatar, đăng xuất. Navigation desktop bị ẩn; không có nút mở menu. Giỏ và danh sách món tự thân không tràn ngang. |
| UI-07 | P2 | Admin mobile bị tràn ngang và cắt nút Cửa hàng. | Viewport 390×844, `document.documentElement.scrollWidth = 514`, `innerWidth = 390`. Header dài, phần nút bên phải bị cắt. |

Ảnh bằng chứng nằm cùng thư mục:

- `01-brewnew-invalid.jpg`: BREWNEW không tồn tại.
- `04-product-update-fetch-error.jpg`: form cập nhật món thất bại.
- `10-vnpay-code72.jpg`: trang lỗi của VNPay Sandbox.
- `11-cancel-blocked-pending-payment.jpg`, `12-mobile-cancel-blocked.jpg`: hủy #137 bị chặn vì payment đang pending.
- `17-admin-desktop-final.jpg`: số liệu dashboard và chỉ số đơn cao nhất.
- `14-mobile-menu.jpg`, `18-admin-mobile.jpg`: kiểm tra mobile.

## Các luồng UI đã kiểm tra

| Nhóm | Thao tác và kết quả |
|---|---|
| Xác thực | Sai mật khẩu báo lỗi; demo và admin đăng nhập đúng; đăng xuất thành công; đăng ký email trùng bị từ chối. UI đăng ký tài khoản mới chưa tạo thêm tài khoản; luồng thành công được kiểm tra bởi backend E2E. |
| Phân quyền | Khách chưa đăng nhập và CUSTOMER bị chặn `/admin`; admin được truy cập. Demo mở đơn #132 của tài khoản khác nhận “Không tìm thấy đơn hàng của bạn”. Lịch sử yêu cầu đăng nhập; nút xác nhận checkout bị vô hiệu khi chưa đăng nhập. |
| Menu | Tải 6 món từ backend; lọc Cà phê Việt ra Cà phê sữa; lọc Trà trái cây ra Trà đào; tìm từ khóa không có trả trạng thái rỗng; nút xem tất cả phục hồi danh sách; giá tăng dần đúng 35k,39k,40k,45k,45k,49k. |
| Chi tiết | Cà phê sữa S 35k → L 45k → thêm hai topping thành 55k; M không topping 40k. Sản phẩm ID 999999 hiển thị “Sản phẩm không tồn tại” sau chu kỳ truy vấn lại. |
| Giỏ | Thêm cùng biến thể hai lần gộp thành một dòng qty=2, tổng 110k; tăng/giảm số lượng; tải lại vẫn giữ giỏ; qty=1 khóa nút giảm. Thanh toán thành công xóa giỏ. Giỏ Trà đào vẫn giữ sau lỗi VNPay. |
| Voucher | Mã không tồn tại bị từ chối; BREWNEW lỗi; GIAM10 giảm đúng 10%; HET_HAN báo hết hạn; GIAM15K bị từ chối khi giỏ 40k chưa đạt tối thiểu 50k. |
| Điểm | Số dư ban đầu demo=0; sau trả #135 có 990 điểm. Dùng tối đa 990 điểm ở #136, quy đổi 1 điểm=1đ. Sau trả #136 còn 350 điểm mới tích lũy. |
| Thanh toán ví | #135: 2 Cà phê sữa L + Kem + Trân châu, 110.000 − 11.000 = **99.000đ**, payment SUCCEEDED, order PAID, giỏ rỗng, lịch sử đúng. |
| Thanh toán thẻ | #136: Cà phê sữa M, 40.000 − 4.000 − 990 = **35.010đ**, payment SUCCEEDED và order PAID. |
| VNPay | Đã mở được URL sandbox do backend tạo, nhưng cổng trả code72; chưa thanh toán thành công hoặc nhận IPN thành công qua cổng ngoài. |
| Admin dashboard | Tải KPI, biểu đồ, số đơn theo trạng thái; đối chiếu doanh thu tích lũy 264.460đ và hôm nay 134.010đ đúng tổng các đơn thanh toán tương ứng. Có lỗi UI-04, UI-05. |
| Admin đơn hàng | Tìm #135; hóa đơn đúng món, topping, voucher, số tiền, mã giao dịch; chuyển PAID → PREPARING → READY → COMPLETED thành công và lịch sử user hiển thị đã hoàn tất. |
| Admin kho | Tìm Matcha Latte; +10:100→110; −10:110→100; lọc tồn thấp hoạt động. Tạo món QA stock=0 thành công, cảnh báo tồn thấp xuất hiện và nút −10 bị khóa; xóa món QA thành công sau xác nhận người dùng. Sửa món lỗi UI-01. |
| Admin voucher | Tạo QAUI20261103 giảm 5%, giới hạn 2 lượt; tạm dừng → kích hoạt thành công; xóa thành công sau xác nhận người dùng. |
| Admin khách hàng | Hiển thị số đơn, chi tiêu và điểm; cộng 100:990→1090; trừ 100:1090→990. Nhập −10000 làm số dư bị chặn sàn về 0, không âm; đã cộng lại 990 để hoàn nguyên trước test đổi điểm. |
| Mobile | Kiểm tra giỏ, menu, modal hủy và admin ở 390×844; storefront không tràn ngang; lỗi UI-06/07. Đã trả viewport về mặc định. |

## Kiểm tra tự động và build

| Lệnh | Kết quả |
|---|---|
| backend `npm test` | **197/197**, 20 files pass. |
| backend `npm run test:e2e` trên DB QA riêng | **107/107**, 13 files pass. Bao gồm auth, RBAC, giới hạn quyền sở hữu, mock checkout, state machine, rewards, idempotency/concurrency, Stripe giả lập, VNPay xử lý tại backend. |
| frontend `node --test tests/*.test.mjs` | **33/33** pass. |
| `node --test scripts/fix12-contract.test.mjs` | **6/6** pass. |
| `node scripts/verify-foundation.mjs` | PASS. |
| frontend `npm run build` | PASS, TypeScript và tạo trang thành công. |
| backend `npm run build` | PASS. |
| frontend `npm run lint` | Exit 0, 4 warnings về `<img>`, 0 errors. |
| backend `npm run lint` | Exit 0, 8 warnings, gồm biến không dùng, unbound-method, base-to-string. |

Tổng **343 test tự động pass** (197+107+33+6), cộng gate Foundation. Lần chạy riêng 59 test phân quyền/auth là tập con của 107 E2E, không tính hai lần.

Không chạy bộ Playwright fixture `frontend/e2e` trong đợt này; kiểm thử browser được thực hiện trực tiếp qua giao diện. `MOCK_GATEWAY_TEST_MODE=false` trên stack hiện tại nên không có checkbox mô phỏng từ chối trên UI; các nhánh decline/retry được backend E2E kiểm tra. Stripe thật, hoàn tiền thật và VNPay thanh toán/IPN thật chưa được xác nhận. Không có giao dịch tiền thật.

## Dữ liệu và trạng thái sau kiểm thử

- Tạo 3 đơn local: **#135 COMPLETED 99.000đ**, **#136 PAID 35.010đ**, **#137 PENDING 39.000đ** tại lần đối chiếu cuối. #137 chưa hủy được do payment VNPay pending; chưa quan sát hết thời gian tự hết hạn.
- Tồn kho cuối lần đối chiếu: Cà phê sữa 95, Americano 99, Cappuccino 100, Trà đào 99, Latte 100, Matcha Latte 100. Các thay đổi tồn do đơn test là dữ liệu nghiệp vụ thực của lần test; thao tác +10/−10 đã hoàn nguyên.
- Demo có 350 điểm sau đổi điểm và cộng điểm từ đơn #136. GIAM10 usedCount=3.
- Món QA #62 và voucher QAUI20261103 đã xóa sau khi người dùng xác nhận; danh sách trở lại 6 món và 3 mã.
- Giỏ còn 1 Trà đào S từ luồng VNPay. Không sửa/xóa các đơn có từ trước (#132–134).
- Database QA riêng được dùng cho E2E và dọn sau khi test xong. Ảnh/report được giữ tại thư mục này; không thay đổi mã nguồn ứng dụng.

## Thứ tự xử lý đề xuất

1. Cho phép PUT trong CORS, rebuild backend và kiểm tra lại lưu sản phẩm bằng trình duyệt.
2. Sửa cấu hình/tích hợp VNPay Sandbox rồi kiểm tra thành công, thất bại, IPN, trở về ứng dụng và giải phóng đơn khi gateway lỗi.
3. Đồng bộ mã khuyến mãi trên banner với dữ liệu khả dụng.
4. Tách trần biểu đồ khỏi chỉ số đơn cao nhất, lọc trạng thái cho số ly đã bán/đã phục vụ.
5. Bổ sung điều hướng mobile và sửa độ rộng header admin.
