# BrewLite — Câu hỏi bảo vệ và cách trả lời khi bị hỏi sâu

Đọc cùng [Học toàn hệ thống](ON-TAP-THUYET-TRINH-BREWLITE.md) và [Đọc từng sơ đồ](GIAI-THICH-SO-DO-BREWLITE.md). Đáp án dựa trên repo ngày 03/11/2026; các mục “cần hoàn thiện” không phải tính năng đã hoàn thành.

Khi luyện, che đáp án, trả lời thành tiếng bằng ví dụ. Nếu chưa chắc một chi tiết, nói phần mình biết và mở đúng source để kiểm tra. Đừng đoán thêm field, thư viện hay quy trình mà repo không có.

## A. Bài toán, kiến trúc và chia việc

### 1. Dự án giải quyết bài toán gì, ai dùng?

BrewLite hỗ trợ khách chọn đồ uống, cấu hình size/topping, đặt và thanh toán không tiền mặt, xem đơn. Quản trị quản lý dữ liệu và quá trình xử lý đơn. Phạm vi nền tảng là đặt đồ uống/nhận tại quầy; các dòng quảng cáo giao hàng ở UI chưa chứng minh đã có nghiệp vụ vận chuyển, địa chỉ, shipper và tracking.

### 2. Tại sao không làm một trang frontend lưu mọi thứ?

Giỏ tạm có thể ở browser, nhưng giá, chủ đơn, kho, thanh toán và điểm phải được kiểm soát ở server và lưu bền vững. Người dùng sửa được localStorage/request; browser đóng không được làm mất đơn hoặc ngăn nhận callback trả tiền.

### 3. Bảy module có phải bảy microservices?

Không. A–G là cách chia trách nhiệm của nhóm; backend Nest là một ứng dụng có các module, cùng PostgreSQL. Catalog/Cart còn bao frontend; A là nền tảng tích hợp. Nếu tách thành microservices sẽ phát sinh giao tiếp mạng và nhất quán phân tán, không chỉ đổi tên thư mục.

### 4. Monorepo và modular monolith khác nhau ra sao?

Monorepo nói về tổ chức mã nguồn trong một Git repo. Modular monolith nói về một ứng dụng backend triển khai chung nhưng chia nội bộ theo nghiệp vụ. BrewLite dùng cả hai. Có thể có monorepo chứa nhiều microservices; hai khái niệm không loại trừ nhau.

### 5. Tại sao dùng Next.js, NestJS, PostgreSQL, Prisma?

Next.js tổ chức UI/routing React; Nest tổ chức HTTP, DI, guard, pipe và module; PostgreSQL cung cấp quan hệ, constraint và transaction; Prisma cung cấp client truy vấn có kiểu và migration workflow. Đó là sự phù hợp với yêu cầu/chia việc của dự án, không cần nói mỗi công nghệ luôn tốt nhất cho mọi hệ thống.

### 6. UI gọi API qua Next server hay trực tiếp Nest?

Các trang client hiện dùng fetch/API helper với `NEXT_PUBLIC_API_URL`, nên browser gọi Nest trực tiếp. Next phục vụ trang/tài nguyên. Trong architecture diagram, đường frontend→backend có thể chỉ là phụ thuộc logic; deployment diagram mới làm rõ public URL và Docker DNS.

### 7. Nếu module G phải gọi từ E/F thì còn “độc lập” không?

Độc lập ở trách nhiệm và contract, không phải hoàn toàn không phụ thuộc. E truyền subtotal và transaction vào RewardsPort; G trả kết quả và thực hiện phần ưu đãi. E không tự viết thuật toán G, G không tự điều phối toàn bộ Order. Shared transaction là chủ đích của monolith.

### 8. Interface đã có rồi, tại sao còn cần Symbol cho DI?

Interface TypeScript bị xóa lúc compile; Nest cần token có thật khi chạy để tra provider. `REWARDS_PORT`/`ORDERS_PAYMENT_PORT` là token đó. Module đăng ký token với implementation; constructor inject token. Unit test có thể cung cấp fake cùng contract.

### 9. Những file nào nhóm dễ đụng nhau nhất?

Prisma schema/migration, app.module/main.ts, layout/header và API client dùng chung. A điều phối các thay đổi đó; mỗi feature ưu tiên sửa vùng sở hữu, mở điểm tích hợp thay vì ghi chéo vào service người khác. Review vẫn phải kiểm tra nội dung, CI không tự giải quyết mọi conflict nghiệp vụ.

## B. Catalog, cart và tính tiền

### 10. Vì sao cùng một món có thể thành hai dòng giỏ?

Khóa dòng gồm productId, size và topping đã chuẩn hóa. Món 1 size M và món 1 size L có phụ thu khác nhau nên là hai biến thể. Cùng size/topping chỉ khác thứ tự topping thì phải gộp qty, không tạo dòng mới.

### 11. Thêm vào giỏ đã trừ kho chưa?

Chưa. Cart là ý định tạm trên browser; stock chỉ được reserve khi `POST /orders` thành công. Trừ ngay khi thêm giỏ sẽ giữ hàng cho cả khách chưa đăng nhập/chưa đặt và cần cơ chế hết hạn khác.

### 12. Đã khóa nút khi stock=0, sao backend còn kiểm tra kho?

UI có thể cũ hoặc bị sửa; người dùng gọi API trực tiếp được. Hai khách cũng có thể cùng thấy còn một món. Chỉ conditional update ở DB lúc tạo đơn mới quyết định ai giữ được hàng.

### 13. Tại sao Cart không có bảng DB?

MVP dùng Zustand và persist localStorage, đủ giữ giỏ khi refresh trên một browser. Đổi lại không tự đồng bộ nhiều thiết bị hoặc theo tài khoản. Nếu cần chức năng đó, thêm server Cart, ownership, merge giỏ guest và version, không giả vờ CartController hiện đã có vì sơ đồ cũ vẽ nó.

### 14. Nếu sửa giá trong DevTools thành 1đ thì sao?

Giá hiển thị có thể bị sửa, nhưng request tạo đơn không nhận giá. E đọc Product.price từ DB và tính lại từ size/topping/qty. Nếu cố gửi unitPrice, global pipe forbid trường ngoài DTO sẽ từ chối. Giá backend trả mới là giá chốt.

### 15. Vì sao frontend vẫn có công thức giá, có bị lặp không?

Cần preview tức thời để khách chọn món. Backend cần bản authoritative để chống giả mạo. Nhóm phải đồng bộ quy tắc qua contract và test; việc có hai nơi tính không có nghĩa được tin kết quả client. Nếu giá DB đổi giữa lúc xem và đặt, Order lấy giá lúc backend chốt.

### 16. Tính thử hai ly base45k, M, một topping, giảm10%, dùng5k điểm?

Mỗi ly55k, hai ly110k. Coupon11k, còn99k; dùng5k điểm còn **94k phải trả**. `discountTotal=16k`, `pointsRedeemed=5k`, EARN=floor(94.000/100)=940. Không lấy 110k−16k−5k vì đã trừ điểm trong discountTotal.

### 17. Product đổi giá thì đơn cũ đổi theo không?

Không đổi unitPrice/lineTotal đã snapshot ở OrderItem và tổng đã chốt ở Order. Tuy nhiên tên/ảnh đọc qua quan hệ Product hiện chưa snapshot đầy đủ, nên không nói mọi nội dung lịch sử đều cố định.

### 18. Badge đang đếm dòng hay số ly?

Tổng qty. Hai dòng qty2 và qty3 cho badge5. `total()` cộng unitPrice×qty; không lấy số dòng nhân một giá chung. Persist lưu items, tổng được tính lại để tránh dữ liệu tổng cũ lệch.

### 19. Qty frontend max99 thì API có nhận100 không?

DTO backend hiện chỉ yêu cầu số nguyên và tối thiểu1, chưa có Max99. Vì vậy không thể dùng giới hạn UI làm bằng chứng validation server. Cần bổ sung giới hạn backend và kiểm tra miền tiền nếu muốn thống nhất đầy đủ.

## C. Identity và phân quyền

### 20. bcrypt có giải mã ra password ban đầu được không?

Không phải cơ chế mã hóa để giải ngược. Khi login, bcrypt compare mật khẩu cung cấp với hash đã lưu. Cost12 làm phép tính tốn công hơn; salt giúp hai tài khoản cùng mật khẩu không cần cùng chuỗi hash. Không lưu hoặc trả mật khẩu gốc.

### 21. JWT có giấu được email và userId không?

Không. JWT dùng ở đây được ký, payload có thể đọc. Chữ ký giúp server phát hiện sửa đổi, expiry giới hạn thời gian sử dụng. Không để password/secret vào payload, không chấp nhận payload chỉ vì frontend decode thành công.

### 22. Client gửi userId khác trong body có lấy đơn người khác không?

Controller dùng principal từ Guard/CurrentUser; JWT sub đã được chuyển thành userId. DTO không nhận userId tùy ý. E/F còn lọc owner ở truy vấn. Các lớp này cùng cần thiết, không chỉ ẩn input userId trên giao diện.

### 23. Token hợp lệ rồi tại sao có thể vẫn bị403/404?

401 là chưa xác thực hợp lệ. Có token nhưng không có role ADMIN thì admin guard trả403. Với đơn không thuộc người gọi, service trả404 để không tiết lộ sự tồn tại của đơn đó. Authenticated không đồng nghĩa authorized cho mọi tài nguyên.

### 24. Hai người đăng ký cùng email đúng lúc thì sao?

DB unique email quyết định chỉ một insert thắng. Request còn lại lỗi Prisma P2002, được đổi thành409. Nếu chỉ “find trước, không có thì insert” mà không unique, cả hai có thể cùng thấy chưa có và tạo trùng.

### 25. Register xong có JWT ngay không?

API register hiện trả id/email. Login mới trả accessToken; UI có thể gọi login sau register. Nest POST auth hiện trả201 do không override status. Không học nhãn200/201 trong sơ đồ thành hai status ngẫu nhiên.

### 26. Tự sửa email thành admin@gmail.com có được quyền không?

Không. AdminRoleGuard đọc role trong DB mỗi request, sau JwtAuthGuard. Role mặc định CUSTOMER. Nút admin trên UI và email không phải cơ sở cấp quyền. Đọc DB cũng giúp thu hồi role có hiệu lực ở request sau.

### 27. CORS có ngăn hacker gọi API không?

CORS là cơ chế trình duyệt kiểm soát truy cập cross-origin, không thay authentication/authorization. curl hoặc client ngoài browser vẫn gửi được request. API cần guard, DTO, owner check, ràng buộc DB và cấu hình triển khai đúng.

### 28. Lưu JWT trong localStorage có nhược điểm gì?

Nếu XSS chạy được trong origin thì script có thể đọc token. MVP hiện làm vậy, chưa có refresh/thu hồi phiên đầy đủ. Hướng cải tiến có thể là cookie HttpOnly/Secure với thiết kế CSRF phù hợp; không nói chỉ đổi nơi lưu là mọi rủi ro biến mất.

## D. Transaction, tồn kho và tạo đơn lặp

### 29. Transaction dùng để bảo vệ điều gì?

Tạo đơn gồm giữ coupon/điểm, trừ kho, tạo Order/Items. Nếu cuối cùng thiếu kho hoặc insert lỗi thì tất cả phải rollback. Nếu mỗi phần commit riêng, có thể mất điểm/quota nhưng không có đơn. Truyền cùng Prisma tx vào các phần là điều kiện để rollback chung.

### 30. Chỉ cần transaction là hết oversell đúng không?

Không. Hai transaction có thể cùng đọc giá trị cũ tùy isolation và kiểu update. E còn dùng OCC: WHERE id+version+stock đủ, rồi decrement/increment nguyên tử và kiểm tra count. Transaction gom tính nguyên tử; conditional update bảo vệ điều kiện cạnh tranh.

### 31. Stock3, hai request mỗi bên mua2 thì diễn biến ra sao?

Cùng đọc version7. Một update đổi thành stock1/version8. Bên còn lại không khớp điều kiện version7 hoặc stock>=2, count0 và rollback. Không được trả thành công cho bên không cập nhật đúng một hàng.

### 32. Vẫn còn hàng mà conflict version thì có nên nói “hết hàng” không?

Không nhất thiết. Version conflict nghĩa dữ liệu đã đổi, có thể vẫn đủ hàng sau khi đọc lại. Code hiện phân biệt OUT_OF_STOCK và STOCK_VERSION_CONFLICT rồi trả409. Có thể thiết kế retry hữu hạn ở tương lai; hiện không nói service tự đảm bảo thử lại thành công.

### 33. Hai dòng cùng sản phẩm khác topping có cần cộng qty kiểm kho không?

Có. Kho đang theo Product, không theo biến thể. Một dòng qty2 và một dòng qty2 của cùng product yêu cầu4 đơn vị. Chỉ kiểm từng dòng với stock3 có thể sai; StockService gom demand theo productId trước.

### 34. Tại sao sort productId trước khi trừ kho?

Để nhiều transaction lấy tài nguyên theo cùng thứ tự, giảm khả năng một bên giữ A chờ B và bên kia giữ B chờ A. Đây là giảm deadlock, không phải bằng chứng không thể có deadlock ở toàn hệ thống.

### 35. Cùng key cùng nội dung nhưng bấm hai lần có hai đơn không?

Thiết kế trả một đơn đã có. Key được scope theo user, payload chuẩn hóa được hash; DB unique(userId,key) là lớp chặn cuối. Request thua race tìm winner và trả lại nếu hash khớp. Vì vậy kho/ưu đãi không được commit thêm lần nữa.

### 36. Cùng key nhưng đổi qty hoặc coupon thì sao?

Hash khác, trả409 payload mismatch. Key định danh một ý định đã chốt, không phải “mã tùy ý để dùng mãi”. Nếu sửa giỏ để tạo ý định mới thì key mới; nếu retry do mất response của ý định cũ thì giữ key cũ.

### 37. RequestHash có thay cho idempotencyKey được không?

Hai vai trò khác nhau. Key định danh lần yêu cầu mà client muốn gửi lại; hash kiểm tra client có dùng lại key cho nội dung khác không. Hai lần khách chủ động mua y hệt nhau có thể cần hai đơn, nên không dùng hash giỏ làm unique toàn cục cấm mua lại.

### 38. Chuẩn hóa payload có làm hai yêu cầu luôn bằng nhau nếu cùng món không?

Không tuyệt đối. Code sắp thứ tự topping và chuẩn hóa coupon, nhưng thứ tự mảng items vẫn ảnh hưởng hash. Đảo thứ tự dòng có thể bị xem là payload khác. Đó là hành vi cần biết; muốn canonical hoàn toàn phải chốt quy tắc và test thêm.

### 39. Key chống trùng có ngăn người khác xem đơn không?

Không. Key là cơ chế retry, không phải credential. Order replay được scope theo user đã xác thực; Payment hash cũng chứa user/order/method và có owner check. JWT/authorization và idempotency giải quyết hai vấn đề khác nhau.

## E. Thanh toán, retry, hủy và hoàn tiền

### 40. “Tiếp tục thanh toán” là quét mã giả à?

Tùy chế độ. Mock chỉ xác nhận giả lập thành công/thất bại, không có chuyển tiền thật. Với VNPay/Stripe, hệ thống mở/lấy lại phiên cổng ngoài và đợi kết quả được backend xác minh. Nút tiếp tục là thao tác trên đơn cũ, không tự nó là bằng chứng ngân hàng đã trả tiền.

### 41. Vì sao phải có nhiều Payment cho một Order?

Mỗi Payment là một attempt. Ví dụ P1 FAILED, khách thử lại P2 SUCCEEDED; vẫn một Order và một lần giữ kho. Nếu unique toàn bảng Payment.orderId thì không lưu được lịch sử retry như hiện tại. ERD 1:1 cũ cần sửa thành1:N.

### 42. Bị decline rồi gửi lại key cũ có thành công không?

Mock trả lại kết quả FAILED cũ vì đó là replay của attempt trước. Muốn chủ động thử thanh toán mới phải key mới trên cùng Order. Đổi `demoDecline`/method nhưng giữ key cũ còn làm hash khác và bị409.

### 43. Timeout rồi sinh key mới luôn có nguy hiểm gì?

Timeout chỉ nói client chưa nhận được kết quả; server/provider có thể đã xử lý thành công. Key mới có thể tạo ý định thanh toán khác. Giữ key cũ và đọc trạng thái giúp khôi phục cùng attempt; không tạo Order mới và không xóa giỏ chỉ vì chưa thấy response.

### 44. Chỉ disable nút là chống double payment được chưa?

Chưa. Người dùng có hai tab, retry mạng, gọi API trực tiếp hoặc hai tiến trình server. UI in-flight chỉ giảm bấm lặp; backend cần unique key, owner/state checks, khóa/CAS và ràng buộc pending/order. Side effect rewards còn cần ledger chống lặp.

### 45. Partial unique index Payment bảo đảm cụ thể gì?

SQL hiện bảo đảm tối đa một hàng **PENDING cho mỗi orderId**. Không phải một hàng Payment cho cả đời Order, cũng không phải một index unique cho cả PENDING và SUCCEEDED. Kiểm tra đơn đã PAID là lớp nghiệp vụ bổ sung, không nên nhận mọi bảo đảm về một index.

### 46. Vì sao không giữ một transaction khi gọi Stripe và chờ khách trả tiền?

PostgreSQL transaction không rollback được giao dịch bên Stripe. Giữ khóa nhiều phút còn gây nghẽn tài nguyên. Hệ thống lưu attempt/phiên, dùng idempotency bên cổng và chốt bằng transaction ngắn sau callback. Có khoảng trạng thái trung gian cần phục hồi và đối soát.

### 47. Return URL báo thành công thì đánh PAID luôn được không?

Không. URL có thể bị sửa hoặc browser không quay lại. Backend cần xác minh chữ ký và dữ liệu webhook/IPN. UI nên đọc Order để hiển thị kết quả; trang VNPay return hiện còn thiếu bước kiểm tra Order trên UI nên không được coi màu xanh của trang là chứng cứ thanh toán.

### 48. Webhook không có JWT khách thì sao biết đáng tin?

Đây là server-to-server callback, dùng chữ ký/secret của provider và đối chiếu transaction/session/amount/currency, không dùng JWT của browser. Stripe cần raw body để xác minh chữ ký. Không bỏ xác minh chỉ vì endpoint tên webhook hoặc query có responseCode00.

### 49. Provider gửi webhook ba lần có cộng điểm ba lần không?

Thiết kế dùng kiểm tra trạng thái/CAS để chỉ chuyển paid và finalize khi cần; G có unique(orderId,kind) và cùng transaction. Bản lặp được nhận dạng để không cộng EARN lần nữa. “Exactly once” ở đây nói về hiệu ứng dữ liệu được bảo vệ trong phạm vi đó, không có nghĩa mạng chỉ gửi đúng một request.

### 50. Thanh toán failed sao chưa trả lại stock và điểm ngay?

Để khách thử trả tiền lại cho cùng đơn đã giữ hàng/ưu đãi. Cancel hoặc expiry mới release reservation. Nếu giữ mãi sẽ chiếm tài nguyên, nên có cancelAfter/worker; nếu muốn release ngay cần thiết kế reacquire và xử lý món/quota có thể hết lúc retry.

### 51. Có nút hủy là hủy được mọi lúc à?

Không. Service chỉ cho PENDING/PAYMENT_FAILED, kiểm tra owner và không có Payment PENDING đang xử lý. Paid cần quy trình hoàn tiền, không chỉ đổi label. UI phải phản ánh lỗi409 nếu trạng thái vừa thay đổi; server mới quyết định cuối.

### 52. Hai người cùng bấm hủy có hoàn kho hai lần không?

Luồng khóa hàng Order và CAS theo trạng thái cũ; chỉ request chuyển thành CANCELLED thành công mới release trong transaction. Request sau thấy không còn trạng thái hủy được thì từ chối. Nếu release tách khỏi state change/transaction thì sẽ mất bảo đảm đó.

### 53. Hết30 phút là chính xác đơn tự hủy ngay không?

Đó là hạn mặc định, có cấu hình. Worker chạy mỗi phút, xử lý theo batch và kiểm tra lại trạng thái/phiên active; feature flag cũng có thể tắt. Có thể hủy muộn hơn hạn. Không mô tả scheduler định kỳ như đồng hồ chính xác từng giây.

### 54. Khách đóng browser trong lúc trả tiền thì sao?

Order/Payment đã ở DB, callback server vẫn có thể chốt kết quả. Khách quay lại xem lịch sử để đọc trạng thái. sessionStorage chỉ giúp phục hồi UI, không là nguồn dữ liệu tài chính duy nhất. Browser đóng không đồng nghĩa giao dịch thất bại.

### 55. Đơn đã hủy nhưng provider báo tiền đến muộn thì sao?

Không tự đổi CANCELLED thành PAID để pha chế đơn đã hoàn kho. Nhánh Stripe ghi nhận tiền và log tình huống không thể fulfill, cần hoàn tiền/đối soát. Repo chưa có quy trình tự động đầy đủ để giải quyết mọi tình huống này. Đây là lý do phải kiểm soát expiry, callback trễ và vận hành.

### 56. Admin đổi status REFUNDED có phải hoàn tiền không?

Không. Chuyển tiền phải qua provider; code admin chặn cách set status đó. Repo có xử lý webhook Stripe refund toàn phần, xác minh amount/currency, ghi Refund rồi cập nhật payment/order/rewards. Chưa có hỗ trợ đầy đủ partial refund hoặc mọi thao tác hoàn từ UI.

### 57. Refund xong có nhập lại kho và hoàn coupon không?

Không được mặc định. Hoàn tiền sau pha chế không có nghĩa ly đã tiêu thụ quay lại kho. Flow refund hiện không gọi StockService.release; release coupon/kho thuộc cancel unpaid. Nếu nghiệp vụ muốn cơ chế khác phải định nghĩa thời điểm và kiểm thử, không dùng chung cancel để né thanh toán.

## F. Coupon, điểm và dữ liệu

### 58. Validate coupon thành công rồi sao tạo đơn vẫn lỗi?

Preview không giữ quota; trước lúc tạo đơn mã có thể hết hạn/hết lượt, giỏ thay đổi hoặc số dư điểm đổi. E gọi G kiểm tra/reserve lại trong transaction. UI cần cho biết đó là báo giá tạm, không lấy preview làm quyền giảm giá vĩnh viễn.

### 59. Hai khách tranh lượt coupon cuối thì sao?

G dùng update có điều kiện usedCount<maxUses để tăng lượt. Một bên thắng; bên còn lại không cập nhật được thì conflict/rollback. Không chỉ đọc usedCount rồi tăng vô điều kiện ở một câu lệnh khác. Các thay đổi admin đồng thời là nhóm tình huống cần kiểm thử riêng khi mở rộng.

### 60. Tại sao trừ điểm lúc PENDING mà đến PAID mới có REDEEM?

Trừ balance khả dụng để giữ điểm, tránh dùng cùng điểm cho hai đơn. Khi trả tiền, REDEEM ghi dấu vết việc sử dụng đã chốt; không trừ balance lần nữa. Nếu hủy unpaid thì hoàn phần giữ mà chưa từng cộng thưởng cho đơn đó.

### 61. Tại sao còn cần LoyaltyEntry khi User đã có loyaltyPoints?

Balance trả lời hiện còn bao nhiêu điểm; ledger cho biết đơn nào tạo loại thay đổi nào và hỗ trợ chống lặp/audit. Unique order+kind ngăn cùng đơn ghi hai EARN. Hiện thao tác chỉnh điểm admin chưa có ledger hoàn chỉnh, nên không tuyên bố có thể dựng lại mọi balance từ ledger trong mọi trường hợp.

### 62. Hoàn tiền mà khách đã tiêu điểm thưởng thì sao?

G thu hồi EARN và có thể trả lại điểm REDEEM theo điều kiện refund. Delta=điểm khôi phục−thưởng thu hồi. Code cho phép balance âm sau refund để không chặn hoàn tiền chỉ vì khách đã tiêu thưởng; có log. Quy tắc “không âm khi reserve” khác “không âm trong mọi tình huống”.

### 63. Mã giảm100% hoặc điểm đủ làm total0 thì hệ thống luôn chạy được chứ?

Hàm tính G cho phép total0, không âm. Điều đó chưa chứng minh mọi provider/UI chấp nhận checkout0. Muốn hỗ trợ đầy đủ cần nhánh đơn0đ rõ ràng, quy tắc finalize và test xuyên suốt; không khẳng định chỉ vì unit test quote trả0.

### 64. PostgreSQL có bao nhiêu bảng, sao không gộp Payment vào Order?

Schema hiện có tám model: User, Product, Order, OrderItem, Payment, Coupon, LoyaltyEntry, Refund. Payment tách vì có nhiều attempts, trạng thái, key và định danh provider riêng; Order giữ nghĩa vụ mua hàng. Gộp một field transactionId vào Order sẽ làm khó lưu lịch sử failed/retry/refund.

### 65. Dùng Int cho tiền có bảo đảm mọi số tiền không sai không?

Int VND tránh lỗi phần lẻ do floating-point trong cách biểu diễn tiền. Vẫn cần giới hạn miền số, validate qty và kiểm tra phép nhân/tổng. PostgreSQL Int hữu hạn; hệ thống hiện chưa là giải pháp đa tiền tệ hay có mọi kiểm tra overflow.

### 66. Sơ đồ nói COMPLETED kết thúc, sao code cho REFUNDED?

COMPLETED kết thúc quy trình nhận đồ uống. Extension refund vẫn có thể đổi trạng thái tài chính. Phải phân biệt kết thúc nghiệp vụ pha chế và trạng thái không còn đường chuyển nào. Bản code hiện REFUNDED mới không có đường ra trong matrix.

### 67. Contract với state.ts khác nhau thì tin file nào?

Để mô tả **hệ thống đang làm gì**, kiểm tra code đang chạy và test. Để xác định **nên làm gì**, đối chiếu yêu cầu/contract đã thống nhất. Hiện contract có PAYMENT_FAILED→PAID, implementation dùng PAYMENT_FAILED→PENDING→PAID; đây là sai khác cần đồng bộ. Không nói cả hai tự động giống nhau vì contract guard xanh.

## G. Quy trình phát triển, kiểm thử và giới hạn

### 68. Nhóm xây nhiều module mà không phải đợi nhau thế nào?

Chốt API/type/giá/status và ownership sớm. C làm store bằng payload mẫu đã thống nhất, D làm auth, B dựng sản phẩm; E và G thống nhất port/transaction; F dùng contract Order để viết recovery/mock. Ghép từng lát cắt nhỏ và test tích hợp khi dependency thật sẵn sàng. Stub giúp phát triển nhưng không được đem response giả làm nghiệm thu thật.

### 69. Scrum có phải chia hết việc từ đầu rồi cuối kỳ ghép không?

Không nên vận hành như vậy. Mỗi sprint cần mục tiêu, phần chạy được để review và điều chỉnh backlog; Daily tập trung tiến độ tới mục tiêu và trở ngại, không chỉ đọc bảng việc. Retrospective chọn cải tiến cụ thể. Phần lịch sử nhóm đã làm thật phải có bằng chứng; roadmap hợp lý không phải log thực tế.

### 70. Trello Done có chứng minh chức năng xong không?

Không tự nó. Done cần tiêu chí: code được review, build/test phù hợp, API/UI ghép được, hướng dẫn và bằng chứng trên đúng phiên bản. Thẻ Done nhưng checkout còn gọi nhầm API vẫn là chưa khép kín luồng. Story points và điểm chấm bài cũng là hai thước đo khác nhau.

### 71. Tại sao report ba sprint còn board bốn sprint?

Đây là tài liệu chưa đồng bộ, không nên tự bịa lịch giải thích. Nhóm cần đối chiếu lịch thực và cập nhật bản báo cáo trước bảo vệ. Burndown hiện ghi minh họa; nói rõ là mẫu mô phỏng quy trình nếu chưa có số đo thật.

### 72. Unit test pass có chứng minh không oversell không?

Chỉ nếu test chỉ ra logic conditional update được gọi đúng; chưa chứng minh DB thật hoạt động đúng với nhiều request. Cần integration/E2E PostgreSQL gửi song song và kiểm tra kho, số đơn, payment/ledger sau cùng. Test fake không thay thế isolation/unique/locking thật.

### 73. Build/lint/contract test khác nhau ở đâu?

Build kiểm tra biên dịch/bundle; lint kiểm tra các luật mã; contract test chỉ kiểm tra các invariant đã mã hóa. Nghiệp vụ sai vẫn có thể build. Test đang pass không đồng nghĩa mọi sơ đồ và contract prose đều đồng bộ với code.

### 74. CI xanh có nghĩa mọi thay đổi local đều đã được kiểm tra không?

Không. CI gắn một commit SHA và môi trường cụ thể. CI d88731d đã kiểm tra commit nền; các thay đổi local cancel/resume chưa có trên remote thì không nằm trong run đó. Test mới local có thể pass nhưng vẫn phải ghi rõ phạm vi, đặc biệt khi dùng mock service.

### 75. Docker smoke HTTP200 đã là browser E2E chưa?

Chưa. Nó chứng minh các service lên và đáp ứng đường kiểm tra. Browser E2E mới click chọn món, login, trả tiền, retry và kiểm tra UI/cart. Lỗi DTO/demoDecline hoặc return page có thể lọt qua smoke không chạm luồng đó.

### 76. Migration, generate và seed khác nhau thế nào?

Migration thay cấu trúc DB theo lịch sử SQL. Generate tạo Prisma client cho code. Seed đưa dữ liệu mẫu. Generate thành công không chứng minh DB có bảng; seed chạy lại phải được thiết kế để không nhân đôi/phá dữ liệu.

### 77. Vì sao seed hai lần trong CI?

Để kiểm tra idempotency bootstrap. Lần hai không được nhân đôi hay thay đổi ngoài dự kiến; CI chụp fingerprint rồi so. Nó khác payment idempotency về nghiệp vụ, cùng ý tưởng “thực hiện lặp không sinh hiệu ứng dư”.

### 78. Đưa .env vào root rồi Docker tự nhận hết đúng không?

Không. Compose chỉ dùng/truyền biến theo cấu hình. Muốn backend nhận VNPAY/Stripe phải khai báo environment/env_file phù hợp; frontend public URL còn có tính chất build-time. Đây là một hạn chế đã thấy trong Compose hiện tại.

### 79. Dự án đã production-ready chưa?

Có nền tảng CI, validation/auth, transaction và các luồng thanh toán tích hợp. Vẫn còn lỗi UI/provider/env, callback/reconciliation, browser E2E và tài liệu cần đồng bộ; chưa đủ để tuyên bố sẵn sàng thu tiền thật ở quy mô vận hành. Nói cụ thể phần làm được và giới hạn, không dùng nhãn “100% hoàn thiện”.

### 80. Nếu dữ liệu tăng gấp100 thì làm gì đầu tiên?

Đo endpoint/query chậm và tải thực. Hiện admin còn đọc nhiều hàng rồi tổng hợp và có thống kê sản phẩm chưa lọc đủ trạng thái; cần sửa tính đúng, phân trang, aggregate DB, index và pool. Sau đó mới chọn cache/queue/tách dịch vụ theo điểm nghẽn, không thêm công nghệ vì tên nghe lớn.

### 81. Nếu cần kho theo nguyên liệu thay vì số ly thì sửa gì?

Thêm Ingredient, định lượng recipe/BOM theo sản phẩm và size/topping, tồn theo đơn vị chuẩn và có thể theo cửa hàng. Tạo đơn gom nhu cầu từng nguyên liệu, reserve atomically, hủy hoàn reservation, pha chế chốt tiêu hao. Không chỉ đổi nhãn stock từ “ly” thành “gram”.

### 82. Nếu được làm tiếp một tuần, ưu tiên gì?

Khép kín checkout/mock/provider và xác minh return UI; truyền đúng env; test browser cả success/decline/unknown/cancel. Đồng bộ các sơ đồ sai với schema/code. Sau đó mới mở rộng tính năng mới, vì hiện luồng khách đặt hàng là phần cần được chứng minh rõ nhất.

## H. Nếu thầy yêu cầu mở code và chỉ ngay

Các đường dẫn dưới đây tính từ repo; chọn đúng phần thay vì tìm ngẫu nhiên trong toàn dự án.

| Thầy hỏi | Mở source | Chỉ điều gì |
|---|---|---|
| Không tin giá frontend ở đâu? | backend/src/orders/orders.service.ts | Đọc products, unitPrice, pricedItems và select tiền |
| DTO chặn gì? | backend/src/orders/orders.dto.ts; main.ts | Nested validation và forbidNonWhitelisted |
| Chống tạo trùng ở đâu? | orders.service.ts; prisma/schema.prisma | userId/key, hash, winner và unique |
| Chống oversell ở đâu? | backend/src/orders/stock.service.ts | demand Map, sort, where version+stock, count |
| JWT xác minh và lấy user ở đâu? | backend/src/auth/jwt.strategy.ts | Passport config và sub→userId |
| Admin quyền từ đâu? | backend/src/admin/admin-role.guard.ts | DB role mỗi request |
| Hủy không hoàn hai lần ở đâu? | orders.service.ts | FOR UPDATE, CAS và release cùng tx |
| State được kiểm soát ở đâu? | backend/src/orders/order-state.ts | ALLOWED và assertPreparationTarget |
| Payment mock có chuyển tiền thật không? | backend/src/payments/mock-payment.service.ts | DB transaction, không có ngân hàng |
| Callback thật xác minh ở đâu? | payments.service.ts; payments/vnpay/vnpay.service.ts | Signature, metadata, amount/currency, settlement |
| Điểm không cộng hai lần ở đâu? | rewards.service.ts; schema.prisma | finalize, orderId_kind, cập nhật balance |
| Preview không trừ quota ở đâu? | rewards.service.ts | validate khác reserveCouponAndPoints |
| Giỏ nhận biết combo ở đâu? | frontend/store/cart-rules.ts; cart.ts | Khóa biến thể, normalize, persist |
| Retry frontend giữ key ở đâu? | frontend/lib/checkout-session.ts; components/order-actions.tsx | Lưu session/attempt, unknown vs definite failure |
| CI làm gì? | .github/workflows/foundation.yml | Bốn job, DB service, seed×2, E2E/smoke |
| DB có unique pending ở đâu? | backend/prisma/migrations/20261030120000_payment_single_pending_per_order/migration.sql | CREATE UNIQUE INDEX và WHERE status=PENDING |

## I. Tám câu “đừng nói sai”

1. Đừng nói JWT được mã hóa nên không đọc được payload.
2. Đừng nói thêm giỏ là đã giữ hàng hoặc đã tạo đơn.
3. Đừng nói frontend gửi total thì backend tin total.
4. Đừng nói transaction tự loại bỏ mọi race, không cần OCC/unique.
5. Đừng nói timeout là chắc chắn failed nên tạo key/order mới ngay.
6. Đừng nói URL return xanh là backend đã nhận tiền.
7. Đừng nói mỗi đơn chỉ có một Payment hoặc COMPLETED không bao giờ chuyển nữa.
8. Đừng nói CI xanh/burndown minh họa chứng minh mọi luồng và lịch sử đều đúng.

## J. Bài tập tình huống — tự kể trước khi nhìn gợi ý

### Tình huống 1: Mất mạng ngay sau POST /orders

Server có thể đã commit. Giữ order key/payload, gửi lại; nếu có winner hash khớp thì cùng ID, không trừ kho/ưu đãi thêm. Không xóa session và tạo key mới chỉ vì không nhận response.

### Tình huống 2: Hai tab cùng trả một Order, hai key khác nhau

UI disable không đủ. Backend cần owner/state, hàng Order được khóa ở luồng phù hợp và constraint một pending/order. Với mock một luồng chốt thành công thì luồng kia thấy đã paid. External cần quản lý phiên active và callbacks; không hứa pending index tự giải quyết mọi giao dịch trễ bên provider.

### Tình huống 3: Coupon còn1 lượt, stock sản phẩm lại hết

G có thể vừa reserve lượt trong tx của E, nhưng StockService lỗi thì transaction rollback nên lượt coupon và điểm trở lại. Không cần một API “undo” riêng cho transaction chưa commit.

### Tình huống 4: Khách có8k điểm, dùng5k, paid94k rồi hoàn toàn phần

Create balance3k; paid EARN940→3.940. Refund thông thường khôi phục5k và thu hồi940→8k, ledger REFUND delta4.060. Nếu khách đã tiêu thưởng sau đó, số dư có thể khác/âm; nếu Order đã CANCELLED trước refund, code có điều kiện không khôi phục REDEEM hai lần. Đừng cộng5k vô điều kiện ở mọi nhánh.

### Tình huống 5: Sơ đồ khác code trước mặt thầy

Nêu chính xác khác ở đâu, ví dụ ERD1:1 cũ so với `Order.payments Payment[]`. Giải thích vì sao code hiện cần1:N để retry. Nhận đây là tài liệu cần cập nhật; không bịa một quan hệ mới để cố giữ hình sai.

## K. Cách trả lời khi chưa biết hết

Mẫu bốn câu: **“Theo bản hiện tại, … . Cơ chế nằm ở … . Nó bảo vệ được … . Trường hợp … chưa khép kín, cần … và test … .”**

Ví dụ: “Theo bản hiện tại, mock retry dùng lại Order và mỗi attempt có payment key. Backend khóa Order và kiểm tra key/hash để không xử lý lại. Nó bảo vệ bấm lặp hoặc mất response của cùng attempt. Với tiền tới muộn sau hủy ở cổng ngoài vẫn cần đối soát/hoàn tiền; nhóm chưa nên gọi đây là quy trình vận hành hoàn chỉnh.”

Trưởng nhóm không cần thuộc từng dòng CSS, nhưng phải biết nguồn giá, thời điểm giữ/hoàn tài nguyên, nơi xác thực quyền và điều kiện chốt thanh toán. Đó là các điểm nối quyết định cả dự án có nhất quán hay không.
