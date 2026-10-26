# BrewLite --- Thư mục LaTeX ERD (Entity Relationship Diagram)

Thư mục này chuyên dùng để lưu trữ và quản lý các sơ đồ quan hệ thực thể (ERD) bằng **LaTeX (TikZ)** cho dự án BrewLite.

---

## 📁 Cấu trúc thư mục

```text
docs/erd-latex/
├── .gitignore            # Bỏ qua các file rác khi compile LaTeX (*.aux, *.log, ...)
├── README.md             # Hướng dẫn sử dụng và cách biên dịch
├── brewlite-erd.tex      # File LaTeX TikZ hoàn chỉnh thể hiện schema của BrewLite
└── template-entity.tex   # Mẫu snippet để copy nhanh khi thêm entity/bảng mới
```

---

## 📊 Sơ đồ hiện tại (`brewlite-erd.tex`)

File `brewlite-erd.tex` được ánh xạ trực tiếp từ `backend/prisma/schema.prisma` (Foundation V1):

| Bảng (Model) | Khóa chính [PK] | Khóa ngoại [FK] / Quan hệ | Ghi chú |
| :--- | :--- | :--- | :--- |
| **`User`** | `id` | - | `email` (Unique), tích điểm `loyaltyPoints` |
| **`Product`** | `id` | - | Sản phẩm cà phê/đồ uống, giá VND, `stock`, optimistic lock `version` |
| **`Order`** | `id` | `userId`, `couponCode` | Đơn hàng, liên kết trạng thái `OrderStatus` |
| **`OrderItem`** | `id` | `orderId`, `productId` | Chi tiết sản phẩm trong đơn, snapshot `size`, `toppings`, `unitPrice` |
| **`Payment`** | `id` | `orderId` | Thanh toán, `idempotencyKey` (Unique), trạng thái `PaymentStatus` |
| **`Coupon`** | `code` | - | Mã giảm giá, hạn dùng, số lần dùng tối đa |
| **`LoyaltyEntry`** | `id` | `userId`, `orderId` | Lịch sử cộng/trừ điểm thưởng (`LoyaltyKind`: EARN / REDEEM) |

---

## 🛠️ Hướng dẫn biên dịch (Compile)

### 1. Dùng TeX Live / MiKTeX (Command line)

Chạy lệnh sau tại thư mục này:

```bash
pdflatex brewlite-erd.tex
```

hoặc dùng `latexmk`:

```bash
latexmk -pdf brewlite-erd.tex
```

File xuất ra là `brewlite-erd.pdf` (tự động cắt sát biên nhờ package `standalone`).

### 2. Dùng VS Code Extension (LaTeX Workshop)

1. Cài extension **LaTeX Workshop** trên VS Code.
2. Mở file `docs/erd-latex/brewlite-erd.tex`.
3. Nhấn tổ hợp phím `Ctrl + Alt + B` để build hoặc mở tab TeX bên trái và chọn **Build LaTeX project**.
4. Xem PDF trực tiếp trong VS Code bằng `Ctrl + Alt + V`.

### 3. Dùng Overleaf (Trực tuyến)

Nếu máy chưa cài LaTeX, bạn có thể:
1. Tạo một project trắng trên [Overleaf](https://www.overleaf.com/).
2. Copy toàn bộ nội dung trong [brewlite-erd.tex](file:///c:/Users/Gtvkun/Documents/GitHub/brewlite/docs/erd-latex/brewlite-erd.tex) vào file `main.tex` trên Overleaf.
3. Bấm **Recompile** để xem và tải về file PDF.

### 4. Dùng Docker (Không cần cài LaTeX lên máy)

```bash
docker run --rm -v "%cd%":/workdir -w /workdir danteev/texlive pdflatex brewlite-erd.tex
```

---

## 🖼️ Xuất ra PNG hoặc SVG

Nếu cần chèn ERD vào tài liệu Markdown (`.md`) hoặc slide thuyết trình:

- **Xuất ra PNG (300 DPI)**:
  ```bash
  pdftoppm -png -r 300 brewlite-erd.pdf brewlite-erd
  ```
- **Xuất ra SVG**:
  ```bash
  inkscape brewlite-erd.pdf --export-filename=brewlite-erd.svg
  ```

---

## ➕ Cách thêm bảng mới vào sơ đồ

Xem hướng dẫn và snippet mẫu trong [template-entity.tex](file:///c:/Users/Gtvkun/Documents/GitHub/brewlite/docs/erd-latex/template-entity.tex).
