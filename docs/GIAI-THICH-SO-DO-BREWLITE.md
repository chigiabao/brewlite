# BrewLite — Đọc và giải thích từng sơ đồ trong repo

Đối chiếu source sơ đồ với implementation ngày 03/11/2026. Đi cùng [Tài liệu học toàn hệ thống](ON-TAP-THUYET-TRINH-BREWLITE.md) và [Câu hỏi bảo vệ](HOI-DAP-BAO-VE-BREWLITE.md).

Tài liệu đọc nội dung **file nguồn** TikZ/LaTeX, PlantUML và nhãn/đường nối trong draw.io. Đây không phải kết quả biên dịch, kiểm tra bố cục từng PDF xuất ra. File SVG cùng tên có thể là một bản xuất ở thời điểm khác; không mặc định SVG, TeX và code đã đồng bộ.

## 1. Trước tiên phải biết mỗi loại sơ đồ trả lời câu gì

| Loại | Câu hỏi nó trả lời | Cách đọc | Không suy ra được chỉ từ hình |
|---|---|---|---|
| Use case | Ai dùng chức năng gì? | Actor, ranh giới, mục tiêu, include/extend | Thứ tự request, transaction hay SQL |
| Activity / flowchart | Một quy trình rẽ nhánh và lặp ra sao? | Start→action→decision→nhánh→end | Class cụ thể nào đang chạy nếu không ghi |
| Sequence | Các bên gửi lời gọi theo thứ tự nào? | Trái–phải là đối tượng; trên–dưới là thời gian | Quan hệ bảng 1:N chỉ từ các mũi tên |
| Class | Thành phần có thuộc tính/phương thức gì và phụ thuộc ai? | Tên, field, operation, quan hệ | Máy/container nào triển khai thành phần đó |
| ERD | Dữ liệu lưu thế nào và liên kết thế nào? | PK/FK/unique/cardinality | Logic nhánh lỗi, thứ tự HTTP |
| Architecture | Các khối hệ thống nối thế nào? | Ranh giới, dependency, giao thức | Mọi chi tiết runtime của một request |
| Deployment | Thành phần chạy trên đâu? | Host/container/port/network/volume | Đúng công thức tính giá hay authorization |

**Use case:** `include` từ use case sử dụng hành vi chung → use case được bao gồm; `extend` từ hành vi bổ sung có điều kiện → use case cơ sở. Chúng không có nghĩa “gọi API tiếp theo”. Tam giác actor generalization chỉ actor chuyên biệt có khả năng của actor tổng quát; không phải tài khoản đổi vai tự động.

**Activity:** hình thoi có guard như `[stock > 0]`; phải nói điều kiện của từng đường ra. Hai nhánh có chung đích không tự tạo quyền thực hiện mọi thao tác phía sau; cần guard hoặc đường tách rõ. Swimlane cho biết trách nhiệm xử lý, không nhất thiết là một server.

**Sequence:** nét đứt dọc là lifeline; thanh hẹp là activation; mũi tên ngang là lời gọi/response; `alt` là chọn nhánh, `opt` là phần tùy điều kiện, `loop` là lặp, `par` là diễn ra song song. Thứ tự trong diagram là mô hình giải thích; phải kiểm tra nó có khớp framework không.

**Class:** `+` public, `-` private; dependency nghĩa một thành phần dùng thành phần khác; composition hình thoi đặc là quan hệ thành phần mạnh. Đừng gán multiplicity dữ liệu cho controller như thể controller là một hàng trong DB.

**ERD:** `1` một, `0..1` có thể không có hoặc một, `0..*` không hoặc nhiều, `1..*` ít nhất một. FK ở bảng con trỏ PK/unique của bảng được tham chiếu. Mỗi Order có tối đa một coupon; một coupon có thể xuất hiện trong nhiều đơn. Không đọc ngược thành mỗi coupon chỉ có một đơn.

## 2. LaTeX/TikZ ở đây là gì?

`.tex` là mã vẽ tài liệu, không phải backend thực thi quy trình. Ví dụ:

```tex
\node[...] (order) {...};
\draw[->] (user) -- (order);
```

`node` tạo hộp/nhãn; tên trong ngoặc là ID để đường nối tham chiếu. `draw` vẽ đường; `node[midway]` gắn nhãn giữa đường; `above/below/right=... of ...` hoặc tọa độ quyết định vị trí; `tikzset` định nghĩa màu và style. `rectangle split`, `nodepart` chia ngăn của bảng/class. Những lệnh này chỉ quyết định hình vẽ. Câu như “trừ kho” trong node không chứng minh code đã thực hiện trừ kho.

PlantUML `.puml` mô tả actor/class/participant và thông điệp; draw.io `.drawio` lưu XML chứa shape, text và edge. Ba định dạng khác nhau cùng phục vụ thiết kế và truyền đạt. File trong thư mục `erd-latex` không phải tất cả đều là ERD: có use case, activity, sequence và deployment.

## 3. Sơ đồ tổng thể — A điều phối, cả nhóm phải hiểu

### 3.1 `erd-latex/SystemArch.tex` — kiến trúc logic

**Hình có:** Browser/UI, Zustand/localStorage, Next.js App Router, NestJS modules, PostgreSQL và Mock Payment.

**Chỉ hình và nói:** “Người dùng thao tác UI; giỏ lưu trên trình duyệt. Các chức năng đặt đơn, tài khoản và trả tiền được phục vụ bởi NestJS. Backend dùng Prisma làm việc với PostgreSQL. Mock chỉ giả lập kết quả trả tiền.”

**Mũi tên cần hiểu:** REST/JSON nối frontend và backend; ORM nối backend với DB; thanh toán nối F với mô phỏng. Đây là quan hệ logic. Trong code các client fetch API đi từ browser tới Nest trực tiếp, không phải mọi request luôn đi Next server rồi mới Nest.

**Đính chính:** MockGateway được vẽ như khối riêng để diễn đạt trách nhiệm, hiện không phải container thứ tư. Class mock hiện là `MockPaymentService`; architecture baseline cũng chưa vẽ hết Admin, Stripe, VNPay, Refund. Bảy module nghiệp vụ không phải bảy microservices.

**Nếu hỏi vì sao frontend cũng tính giá:** để phản hồi ngay khi đổi size/topping; backend vẫn tính lại trước chốt đơn vì không tin client.

### 3.2 `erd-latex/Deployment Diagram.tex` — chạy trên máy và Docker

**Hình có:** browser, Docker host/network, frontend Next :3000, backend Nest :3001, PostgreSQL :5432, named volume, startup, môi trường và CI.

**Đọc theo ba lớp:** (1) browser truy cập public port của UI/API; (2) backend gọi DB bằng `db:5432` trong Docker network; (3) dữ liệu DB nằm trên volume, cấu trúc DB được migration, dữ liệu mẫu bằng seed.

Luồng khởi động là `db healthy → backend migrate/seed/start/ready → frontend`. Backend build dùng URL giả để generate/build; kết nối thật chỉ được chứng minh khi runtime/test chạm DB. Build thành công khác DB ready.

Đường FE→API đứt là phụ thuộc logic; đường browser→API mới thể hiện fetch thực tế. `NEXT_PUBLIC_API_URL=http://localhost:3001` phục vụ browser trên máy demo; người xem từ máy khác cần URL host phù hợp. `db` không phải tên để browser gọi.

**Đính chính:** chữ “đồng bộ 100%” trong hình không thay thế log của commit đang trình bày. Env payment chưa được Compose truyền đầy đủ như kỳ vọng; có `.env` ở root chưa bảo đảm mọi container nhận mọi biến. Hình này mô tả baseline, chưa diễn tả hết callback cổng ngoài.

**Nếu hỏi volume có phải backup:** volume giữ qua thay container, backup cần bản sao độc lập và quy trình khôi phục.

### 3.3 `erd-latex/Usecase.tex` — use case toàn hệ thống

**Actor:** Guest, Customer kế thừa Guest, gateway mock; Staff và Inventory được đặt ở vùng ngoài MVP.

**Đọc:** Guest xem menu/chi tiết, tùy chọn, giỏ và đăng ký/đăng nhập. Customer tạo đơn, xem lịch sử, dùng ưu đãi/điểm và thanh toán/thử lại. Giá/kho là hành vi cần của tạo đơn; coupon/points là phần có điều kiện.

Đừng đọc các oval thành một sequence cứng. Từ hình này chưa biết stock reserve trước hay sau coupon, hoặc đâu là transaction; phải dùng flow E/G để giải thích.

**Đính chính:** phân vùng “ngoài MVP” là phạm vi thiết kế ban đầu. Repo hiện có AdminModule cập nhật pha chế và kho, nên không nói mọi chức năng đó đều chưa tồn tại. Cũng không nói đã có toàn bộ tính năng thủ kho/nguyên liệu/giao vận chỉ vì có actor.

**Nếu hỏi khách chưa login có được thêm giỏ:** có vì giỏ ở browser; tạo đơn và thanh toán cần JWT.

## 4. Sơ đồ B — Catalog và phần giao tiếp với C

### 4.1 `erd-latex/usecase_B.tex` — hành vi xem và chọn món

**Hình có:** Customer, vùng Catalog B với xem menu/chi tiết, chọn size/topping, xem giá, thêm giỏ, báo hết hàng; vùng C nhận món vào state Zustand.

**Đọc:** người dùng vào menu, mở chi tiết, thay size/topping để xem giá dự kiến; khi thêm món, B giao cấu hình cho C. Hết hàng là một điều kiện hiển thị/khóa thao tác. Include tính giá cho thấy hành vi dùng lại khi thay tùy chọn.

**Phải nói ranh giới:** Catalog đọc Product; Cart giữ lựa chọn mua; Ordering mới giữ hàng. Mũi tên vào C là gọi store frontend, không phải POST Cart API. Giá B truyền vào store để hiển thị không trở thành giá đáng tin cho Orders.

**Nếu bị hỏi stock thay đổi sau khi UI đã tải:** backend giữ hàng bằng conditional update khi tạo đơn, UI stock chỉ là thông tin tại thời điểm đọc.

### 4.2 `erd-latex/activity_B.tex` — vòng lặp tương tác chi tiết

**Swimlane:** khách và hệ thống Catalog/Stock.

**Đọc lần lượt:** mở menu→GET danh sách→chọn sản phẩm→GET chi tiết→size S/topping rỗng→kiểm tra stock→khóa/mở nút→đợi thao tác. Chọn size/topping quay vòng tính giá; chọn món khác quay menu; bấm thêm chuyển CartItem sang Zustand/localStorage, toast và badge.

**Chỗ cần cẩn thận:** file TeX hiện gộp nhánh giao diện hết hàng và còn hàng về trạng thái UI sẵn sàng, sau đó vẫn có nhánh thêm giỏ. Khi trình bày phải nói **thêm chỉ hợp lệ nếu stock > 0**; hình nên có guard hoặc tách đường cho rõ. Không dùng hình để khẳng định hết hàng vẫn được thêm. Báo cáo audit từng nói đã tách triệt để nhưng không được lấy câu đó thay việc đọc file hiện có.

“Stock” ở lane này là đọc và hiển thị tồn, chưa phải `StockService.reserve` của E. CartItem implementation dùng `productId`, không dùng chung mọi field của Product làm khóa.

**Nếu hỏi vì sao kết thúc activity sau toast mà vẫn còn trang:** activity mô hình hóa một lần thêm món, không có nghĩa browser đóng.

### 4.3 `erd-latex/B_sequencediagram.tex` — lời gọi từ chi tiết đến giỏ

**Lifeline:** khách→UI→CartStore; CatalogController→CatalogService→DB/Prisma.

**Đọc trên xuống:** UI tải Product; controller gọi service; service query DB; trả product; UI khởi tạo lựa chọn và giá. Khi đổi lựa chọn, UI tự tính giá. `opt [stock>0]` bao phần thêm store, cập nhật hiển thị/toast.

**Các tên đang cũ:** hình ghi `/api/products/{id}`, `CatalogController/CatalogService`, `fetchProductById`, `addItem`. Code hiện dùng `/products/:id`, `ProductsController/ProductsService` và action store `add`. Không nói đã có `/api` prefix hay controller Catalog chỉ vì hình ghi vậy.

**Nếu hỏi tại sao đổi size không query DB mỗi lần:** công thức phụ thu xác định ở client cho preview; backend đọc lại dữ liệu khi tạo đơn.

### 4.4 `erd-latex/B_classdiagram_catalog_and_cart.tex` — sơ đồ cần sửa đáng kể

**Ý định:** mô tả Catalog, dữ liệu Product và CartStore. Quan hệ controller→service→DB là mẫu phân lớp hợp lý.

**Những phần không khớp implementation:**

| Trong hình | Trong source hiện tại |
|---|---|
| CatalogController/CatalogService | ProductsController/ProductsService |
| ProductDTO id String | ID Int |
| CartStore totalAmount, calculateTotal, addItem/removeItem, checkout | Store có total()/count(), add/remove/setQty/clear |
| CartController, CartService backend | Không có các thành phần này |
| HTTP POST từ store sang cart backend | Cart chỉ cập nhật frontend/localStorage |
| Prisma saveCartSession | Không có model Cart/session giỏ theo hình |

**Lời giải thích nên dùng:** “Sơ đồ lớp này còn trộn thiết kế lưu giỏ trên server với implementation giỏ local. Trong phiên bản đang chạy, nhánh CartController/CartService cần bỏ; CartStore dùng Zustand. Tạo Order là API của E.”

Không nên đưa nguyên hình này làm bằng chứng kiến trúc hiện hành. Việc thừa các class không tồn tại là sai khác nội dung, không chỉ khác tên.

## 5. C — vì sao không thấy một bộ sơ đồ riêng?

C xuất hiện ở use case/activity/sequence/class B–C và trong kiến trúc tổng. Không thấy file `.tex` độc lập cho toàn bộ Cart trong inventory hiện tại. Một sơ đồ có thể bao hai module; một module cũng không bắt buộc đúng một hình.

Khi hỏi C hoạt động thế nào, chỉ hai vùng: B gọi `CartStore.add` và CartStore persist items. Giải thích khóa `productId|size|sortedToppings`; sửa qty/xóa tính lại total/badge; refresh hydrate từ storage. Sang checkout, F/E lấy cấu hình giỏ để tạo Order, không gọi backend Cart.

## 6. D — năm sơ đồ PlantUML Identity

Các file `.svg` cùng tên trong `docs/diagrams/` là bản hình xuất sẵn. Phân tích dưới đây theo `.puml`.

### 6.1 `diagrams/uc-02-use-case.puml`

Guest đăng ký/đăng nhập; Customer dùng API yêu cầu đăng nhập. Register/Login include kiểm tra AuthDto. Trùng email, sai credentials và token thiếu/sai là nhánh ngoại lệ, vẽ extend về ca sử dụng tương ứng. E/F dùng guard của D.

**Lưu ý mô hình:** DTO/guard là cơ chế kỹ thuật, không phải mọi oval đều là mục tiêu độc lập mà người dùng chủ động thực hiện. E/F nằm trong cùng backend; hình vẽ “secondary system” nhằm chỉ bên sử dụng chức năng, không chứng minh E/F là hệ thống mạng độc lập.

**Câu chốt:** “D cung cấp danh tính đã xác minh; E/F kiểm tra quyền thao tác với từng đơn.”

### 6.2 `diagrams/uc-02-class-architecture.puml`

**Đọc:** AuthController dùng AuthDto/AuthService. AuthService dùng Prisma và JwtService. JwtAuthGuard dùng Passport/JwtStrategy. CurrentUser lấy principal từ request. Orders/Payments dùng facade public.ts của D.

**Đính chính chi tiết:**

- Hình có `AuthService.validateUser`, source hiện không tách method này; login thực hiện findUnique/compare trực tiếp.
- User trong hình có `createdAt`, schema User hiện chưa có field đó; schema có role và loyaltyPoints mà hình giản lược.
- Quan hệ `User 1 — 0..* OrdersController` là nhầm đối tượng dữ liệu với controller. Quan hệ đúng là User–Order, còn controller chỉ dùng danh tính để truy vấn.
- Tên operation consumer trong hình minh họa trách nhiệm, không phải danh mục đầy đủ tên method hiện tại.

Đây là diagram kiến trúc lớp/phụ thuộc, không thay ERD. Không khẳng định controller được tạo riêng cho từng user.

### 6.3 `diagrams/uc-02-sequence-register.puml`

**Đọc các nhánh alt:**

1. Client gửi email/password; DTO sai trả 400, chưa đến lưu DB.
2. Hợp lệ→AuthController→AuthService→bcrypt hash cost 12.
3. DB create gặp unique email→P2002→409.
4. Tạo thành công→201→trả id/email, không hash.

Hai người đăng ký cùng email: kiểm tra tồn tại ở ứng dụng nếu có cũng chưa đủ; unique DB quyết định một người thắng. Hash có thể đã được tính trước khi DB phát hiện trùng, điều đó bình thường.

**Chi tiết giản lược:** hình vẽ DB trả record gồm hash, thực tế create đang select id/email ngay tại Prisma. Điều đảm bảo cần nói là response không chứa hash. Register không cấp token; login là bước riêng.

### 6.4 `diagrams/uc-02-sequence-login.puml`

**Đọc:** DTO400 hoặc email không tồn tại401 hoặc compare sai401; nếu đúng→JwtService ký sub/email→trả accessToken. Hạn token theo AuthModule là một ngày.

Sai email và sai password trả cùng thông điệp; không trả “email chưa đăng ký” ở login để tránh giúp dò tài khoản. Không lấy JWT bằng cách giải mã passwordHash.

**Đính chính:** nhãn `200/201` là chưa chốt HTTP status. AuthController POST hiện không override nên Nest trả 201. JWT payload có thể đọc; an toàn dựa vào chữ ký/secret và hạn dùng, không phải giấu được payload.

### 6.5 `diagrams/uc-02-sequence-protected-access.puml`

**Đọc:** GET /orders/me kèm Bearer→Guard/Passport kiểm tra→nếu thiếu/sai/hết hạn401; hợp lệ thì CurrentUser→OrdersController→OrdersService→DB lọc userId→200 danh sách của chính user.

**Đính chính:** hình giản lược controller gọi DB trực tiếp và dùng `user.sub`; source controller gọi service bằng `AuthUser.userId` sau khi strategy chuyển sub. Kiểm tra chữ ký/hạn được Passport thực hiện trước `validate(payload)`, không phải hàm validate tự tính lại chữ ký như một thư viện crypto.

**Câu hỏi nối tiếp:** đổi `/orders/1` thành `/orders/2`? Guard chỉ xác thực, service còn phải lọc owner. Token đúng không cho xem mọi đơn. CORS không chống được người gọi trực tiếp bằng curl/Postman.

Các file `sprint-3-concurrent-signup.svg` và `sprint-3-ownership-flow.svg` được báo cáo cũ dẫn nhưng không còn trong repo sau pull. Không nói đã xem nội dung hình hiện tại của chúng hoặc có đầy đủ mã nguồn tái tạo nếu chỉ thấy link báo cáo.

## 7. E — năm sơ đồ Ordering, từ mục tiêu đến transaction

### 7.1 `erd-latex/E_usecase.tex`

**Ba vùng:** Customer và Ordering; Rewards G; Payments F. Tạo đơn bao kiểm tra giỏ, tính tiền và giữ kho. G vẽ validate coupon và điểm. F vẽ chọn WALLET/CARD, xác nhận, lỗi và retry.

**Đọc ý nghĩa:** E biến cấu hình mua thành đơn; G bổ sung giảm giá; F trả tiền cho đơn đã có. Chọn phương thức không tự đồng nghĩa thanh toán thành công.

**Điểm thiếu:** hình chưa nối rõ toàn bộ coupon/points vào tạo đơn, nên G có node bị tách rời. Cần dùng flow reserve để bổ sung lời giải thích; không nói vì oval rời nên G chưa được tích hợp. JWT/idempotency không vẽ ở hình mức use case không có nghĩa implementation không cần.

Luồng external VNPay/Stripe mới chưa thể hiện đầy đủ trong hình chỉ có ví/thẻ mock.

### 7.2 `erd-latex/activity_E.tex`

**Swimlane:** khách, E, G. Ý tưởng là kiểm tra giỏ→đọc Product→xử lý coupon/điểm nếu chọn→tính tiền→giữ kho→lưu đơn→trả kết quả; thất bại giữ giỏ để sửa/thử lại.

**Sai khác quan trọng:** nhánh coupon không hợp lệ trong hình ghi **“Bỏ qua Coupon”** rồi đi tiếp. Source hiện tìm mã không có thì404, không đủ điều kiện thì400 và từ chối tạo đơn. Không âm thầm bỏ mã để khách trả cao hơn mức họ đang xác nhận.

Thực tế subtotal từ DB phải có trước khi G kiểm tra minOrderValue và giảm giá. Tất cả reserve coupon/points, stock, tạo Order đều nằm trong transaction; hình không vẽ transaction rõ và các đường đi có thể gây hiểu nhầm. Hãy dùng FLOW-02-E làm tham chiếu khi thầy hỏi thứ tự/rollback.

**Câu chốt:** “Hình activity này diễn đạt luồng nghiệp vụ tổng, nhưng nhánh coupon invalid cần sửa thành báo lỗi và rollback để khớp source.”

### 7.3 `erd-latex/sequence_ordering.tex`

**Lifeline:** khách, controller, DTO, service đơn, service kho, DB.

**Đọc:** yêu cầu có khóa→kiểm tra đầu vào→service tìm key→đọc giá Product→tính/snapshot→giữ kho→tạo Order/OrderItem→commit→trả đơn PENDING. Cùng key/cùng payload trả lại; key khác payload409. Thiếu hàng hoặc lỗi DB rollback.

**Hai cách nói cần sửa:**

- Sơ đồ vẽ controller gửi DTO để kiểm tra; trong Nest, Pipe thực hiện validation trước khi method controller được gọi. DTO là lớp khai báo ràng buộc, không phải một service chạy riêng.
- “Xác nhận giao dịch” ở gần cuối là **commit transaction DB**, không phải giao dịch thanh toán thành công. Order vẫn PENDING.

Hình chưa có lifeline G và chưa vẽ chi tiết nhánh duplicate/race; không dùng nó làm toàn bộ sequence của coupon/loyalty. Bổ sung bằng FLOW-02-E và FLOW-04.

### 7.4 `erd-latex/FLOW-02-E.tex` — flow tạo đơn chi tiết nhất

Đọc từ đầu, dừng ở từng decision:

1. **Key có hợp lệ không?** Không→400. Có→normalize/hash.
2. **Đã có user+key?** Có→hash giống thì replay, khác thì409. Chưa→mở transaction.
3. **Kiểm tra lại trùng trong tx.** Giảm race nhưng unique constraint mới là lớp chặn cuối.
4. **Product đủ và hợp lệ?** Không→rollback. Có→server pricing và snapshot.
5. **Có dùng coupon/điểm?** Có→G reserve bằng tx; lỗi→rollback.
6. **Gom qty theo Product, sort ID, OCC từng sản phẩm.** update count0→conflict→rollback cả reserve đã làm.
7. **Tạo Order PENDING/Items với key/hash và hạn.** Commit→trả kết quả.
8. **Có lỗi/race?** Tìm winner theo key, hash khớp thì trả winner; không có winner thì trả lỗi thật.

**Tại sao check key hai lần vẫn cần unique?** Hai transaction vẫn có thể cùng đọc “chưa có” trước khi một bên insert. Unique DB giữ tính duy nhất bất kể đường đọc.

**Tại sao G trước stock vẫn an toàn?** Vì cùng transaction. Nếu stock thất bại, thay đổi điểm/quota G vừa làm được rollback. Nếu G dùng transaction khác thì giải thích này không còn đúng.

**Không nói quá:** vòng sản phẩm có thể được biểu đạt giản lược trên hình; code lặp qua tất cả product IDs. OCC hiện báo conflict, không có vòng tự retry stock tới khi thành công.

### 7.5 `erd-latex/classdiagram_E.tex`

**Đọc từ cửa vào:** OrdersController→OrdersService. Service phụ thuộc Prisma, StockService, RewardsPort và luật OrderState. OrderExpiryService gọi service để hủy hết hạn. StockService dùng Product.version. Order gồm nhiều OrderItem; mỗi item tham chiếu Product.

**Vì sao tách:** Service điều phối; Stock gom/giữ/hoàn kho; state là hàm luật chuyển; Rewards là contract G. Viết test một phần không cần dựng mọi phần còn lại.

**Đính chính:** danh sách operation controller chưa vẽ cancel route mới local. Những field không vẽ không nhất thiết không tồn tại. RewardsPort có refund là extension; cần đọc implementation thực tế để biết nó được gọi sau xác nhận cổng, không chỉ khi UI bấm hoàn.

**Nếu hỏi vì sao F không sửa trạng thái tự do:** F gọi điểm tích hợp và dùng luật E; admin cũng phải qua API nghiệp vụ thay vì ghi tùy ý vào Order.status.

## 8. F/G — hai sơ đồ draw.io dùng chung

Không có một bộ `.tex` riêng đầy đủ cho Payments và Rewards trong inventory hiện tại. Hai flow/ERD sau là tài liệu liên module; F/G còn xuất hiện ở use case tổng và E. Việc thiếu hình độc lập không chứng minh thiếu code, nhưng khi trình bày nên bổ sung lời giải thích callback/retry cụ thể.

### 8.1 `ERD-02-Order-Payment-Coupon-Loyalty.drawio`

**Đọc từ Order ở giữa:** thuộc User; có subtotal/discount/points/total, snapshot trong Items; liên kết nhiều lần Payment; coupon và LoyaltyEntry làm cơ sở ưu đãi/audit. Key/hash phân biệt gửi lại với yêu cầu mới.

Mục đích là giúp nhìn dữ liệu xuyên E/F/G: giữ quota/points khi tạo đơn, finalize khi paid, đọc lại khi retry/cancel. Cần đối chiếu PK/FK/unique với schema và SQL.

**Các nhãn đã cũ:**

- Có `processingLeaseUntil` nhưng schema hiện không có field này.
- Nhãn “một active PENDING/SUCCEEDED” không phải nguyên văn ràng buộc SQL: partial index hiện chỉ lọc **status='PENDING'**. Việc chặn trả tiền lại sau SUCCEEDED còn do logic trạng thái.
- Chỉ vẽ EARN/REDEEM và giới hạn 0..2 entries là baseline trước REFUND.
- Chưa bao đầy đủ User.role, Payment gateway/session VNPay/Stripe và Refund.

**Câu chốt:** “Hình dùng để giải thích quan hệ core, còn ràng buộc triển khai hiện tại cần đọc migration; em không dùng lease field trong hình để khẳng định backend đã có lease worker.”

### 8.2 `FLOW-04-Coupon-Validation-Loyalty-Reserve-Finalize.drawio`

Hình chia bốn giai đoạn. Đây là hình tốt để kể toàn bộ ưu đãi, với các tên implementation cần cập nhật.

**Dải 1 — Preview:** khách nhập coupon→POST validate→kiểm tra mã/điều kiện→trả discount. Không tăng usedCount, không trừ điểm. Tác dụng là báo giá tạm, không giữ quyền dùng mã.

**Dải 2 — Create/reserve:** E mở tx, đọc giá DB và subtotal→G reserve coupon quota/points→Stock reserve→lưu Order PENDING/snapshot→commit. Bất kỳ bước lỗi nào rollback. Sau bước này số dư khả dụng đã giảm dù chưa có EARN.

**Dải 3 — Paid/finalize:** F có kết quả thành công đáng tin→Payment SUCCEEDED→E markPaid→G ghi REDEEM nếu có và EARN; cùng tx chốt dữ liệu. Unique order+kind và điều kiện chuyển trạng thái ngăn ghi lặp. Ghi REDEEM không trừ balance lần nữa vì đã reserve.

**Dải 4 — Failed/retry/cancel:** decline→PAYMENT_FAILED, giữ stock/quota/points cho retry. Unknown outcome→key cũ. Lần thử mới sau definite failure→key mới, Order cũ. Cancel unpaid hợp lệ→CAS CANCELLED và release một lần.

**Đính chính:** nhãn `PaymentService.pay` là tên sơ lược/cũ; mock hiện `MockPaymentService.pay`, external dùng `PaymentsService.createCheckout` và callbacks. Nhắc tới pending lease là mô tả đề xuất cũ; không tự suy ra schema đã có field lease. Hình này cũng chưa diễn tả đầy đủ refund/negative balance sau thu hồi điểm.

**Câu hỏi rất hay:** vì sao failed không release ngay? Để giữ đơn cho lần thử lại; hệ thống cần hạn/hủy để không giữ tài nguyên mãi. Đổi chính sách release ngay được, nhưng phải thiết kế lại reacquire và có thể không còn bảo đảm giữ món/giá/ưu đãi cho lần retry.

## 9. Hai ERD LaTeX — phải chỉ rõ bản nào đang cũ

### 9.1 `erd-latex/brewlite-erd.tex`

Vẽ bảy bảng core: User, Product, Order, OrderItem, Payment, Coupon, LoyaltyEntry. Đây là bản có **Order–Payment 1:N**, phù hợp ý tưởng nhiều attempts hơn bản ErdTongQuat.

**Đọc thứ tự:** User1:NOrder; Order1:NOrderItem; Product1:NOrderItem; Coupon optional trên mỗi Order; Order1:NPayment; User/Order liên kết nhiều LoyaltyEntry. Tiền ở Order và snapshot ở Items giúp không phải dựng lại hóa đơn từ giá Product hiện tại.

**Thiếu so với hiện tại:** Order key/hash/cancelAfter, role User, các field gateway/session/callback, Refund, enum VNPAY/REFUNDED/REFUND. Nhãn “Foundation V1” cho biết đây là baseline, không phải schema đầy đủ ngày 03/11.

Arrow style trong hình nói rõ quy ước riêng; khi đọc vẫn dùng nhãn cardinality và FK. Không nhầm mũi tên ERD thành lời gọi API.

### 9.2 `erd-latex/ErdTongQuat.tex`

Vẽ bảng chi tiết hơn với PK/FK/UQ và Product.version; giải thích price snapshot và ledger unique. Tuy nhiên bảng Payment có `orderId unique` và đường **Order1–0..1Payment**, đó là **thiết kế cũ sai với retry hiện tại**.

**Cách sửa lời trình bày:** một Order có thể chưa có attempt, có một failed, rồi có succeeded. Vì vậy quan hệ là Order1–0..*Payment. Payment.orderId không unique toàn bảng; unique key cho từng attempt và partial index pending/order giải quyết hai việc khác nhau.

LoyaltyEntry ghi max2 chỉ đúng baseline EARN/REDEEM; hiện thêm REFUND. `toppings: Json/String[]` là nhãn chưa chốt, Prisma hiện dùng String[]. Payment thiếu status/requestHash/session fields nên không đủ để giải thích callback hoặc idempotency hoàn chỉnh.

**Nếu thầy chỉ vào hình 1:1 hỏi tại sao nhiều Payment:** trả lời thẳng đây là diagram chưa cập nhật sau khi bổ sung retry; trỏ schema `payments Payment[]`, bản migration và ví dụ một failed/một succeeded. Đừng cố giải thích 1:1 vẫn chứa được nhiều rows.

### 9.3 `erd-latex/template-entity.tex`

Đây là snippet hướng dẫn thêm node table, PK/FK và đường 1:N, không phải một sơ đồ nghiệp vụ độc lập. Không phải “module thứ tám”, không phải model đang tồn tại trong DB. README trong thư mục là cách biên dịch/xuất ảnh; bảng inventory trong README chưa liệt kê hết các hình về sau.

## 10. Những gì các hình chưa thể hiện đầy đủ

Admin/RBAC, Stripe/VNPay callback, expiry/reconciliation, refund và các nhánh browser recovery không có một bộ diagram hiện hành đầy đủ tương xứng. Khi nói toàn dự án, phải bổ sung từ code. Không lấy vùng “ngoài MVP” của use case cũ để phủ nhận Admin hiện có, hoặc lấy một ô MockGateway để khẳng định đã có ngân hàng thật.

Sơ đồ học lại sau đây là **bản rút gọn giải thích theo code**, không phải tuyên bố đã sửa các source diagram cũ:

```mermaid
sequenceDiagram
  actor K as Khách
  participant U as UI và Cart
  participant D as Auth
  participant E as Orders
  participant G as Rewards
  participant DB as PostgreSQL
  participant F as Payments
  K->>U: Chọn món và cấu hình
  U->>U: Giữ Cart trong browser
  K->>D: Đăng nhập
  D-->>U: JWT
  U->>E: POST /orders + JWT + order key
  E->>DB: Đọc giá, mở transaction
  E->>G: Reserve coupon và points bằng tx
  G->>DB: Conditional quota/balance update
  E->>DB: OCC stock, tạo Order và Items, commit
  E-->>U: Order PENDING và tổng chính thức
  U->>F: Trả tiền cho Order + payment key
  Note over F,DB: Mock chốt trực tiếp; cổng ngoài đợi callback đã xác minh
  F->>DB: Payment SUCCEEDED trong tx
  F->>E: markPaid qua port
  F->>G: finalizeRewardsOnPaid bằng cùng tx
  G->>DB: Ledger và điểm thưởng
  F-->>U: Kết quả hoặc trạng thái có thể đọc lại
  U->>E: GET Order để xác minh
  E-->>U: Trạng thái Order
  U->>U: Sau xác minh paid, kết thúc giỏ đúng phiên
```

Không phải chuỗi nào bên trên cũng là HTTP: E→G và F→port/G là lời gọi trong một backend. Riêng POST tới endpoint được ghi rõ mới là request browser. Sơ đồ này không vẽ chi tiết auth, nhánh decline, timeout hay refund; đã giải thích ở tài liệu chính.

## 11. Danh sách cần cập nhật trước khi dùng hình trong slide

| Ưu tiên | Hình/tài liệu | Nội dung cần đồng bộ |
|---|---|---|
| Cao | B class | Bỏ CartController/CartService/saveCartSession, sửa Products và ID |
| Cao | ErdTongQuat | Order–Payment1:N, bỏ unique toàn bảng orderId |
| Cao | Activity E | Invalid coupon báo lỗi; rõ subtotal/tx/rollback |
| Cao | Activity B | Guard stock cho add, không mở đường hết hàng vào thao tác thêm |
| Cao | D class | Bỏ multiplicity User–Controller, dùng User–Order; sửa field/method |
| Vừa | B sequence | `/products/:id`, tên Products và store.add |
| Vừa | D protected | Service layer, userId mapping và Passport verification |
| Vừa | Drawio ERD/FLOW | Bỏ field lease chưa tồn tại, sửa partial index, bổ sung refund |
| Vừa | ERD và overall use case | Role/admin, payment gateway, trạng thái extension |
| Vừa | Báo cáo sprint/inventory | Số sprint, file bị xóa, link máy Admin cũ, số liệu minh họa |

Tài liệu này chỉ ghi nhận và hướng dẫn đọc; chưa tự sửa các diagram gốc. Cần đồng bộ source rồi xuất hình lại để không mang slide cũ vào buổi bảo vệ.

## 12. Công thức giải thích bất kỳ sơ đồ nào trong 45–60 giây

1. “Hình này là **loại gì**, dùng để trả lời **vấn đề gì**.”
2. “Các bên chính là **ai/thành phần nào**, ranh giới ở đâu.”
3. “Luồng thành công bắt đầu tại …, đi qua …, kết thúc ở ….”
4. “Nhánh lỗi quan trọng là …; dữ liệu được giữ/hoàn tác như ….”
5. “Trong code nó tương ứng file/method …; hình có phần cũ … cần cập nhật.”

Ví dụ với FLOW-02-E: “Đây là flow tạo đơn của E. Nó bắt đầu từ request đã xác thực, kiểm tra key/hash rồi mở transaction. Server đọc giá, nhờ G giữ ưu đãi, giữ kho OCC và lưu đơn PENDING. Gửi lại cùng key không tạo đơn mới; kho/coupon lỗi thì rollback. Code nằm ở OrdersService.create và StockService.reserve.”
