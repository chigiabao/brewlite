# Rewards G-03/G-04 — Hotfix

Bản vá change-only cho BrewLite. Giải nén tại gốc repo.

- Kiểm tra snapshot đơn PAID trước khi ghi REDEEM/EARN.
- Kiểm tra snapshot đơn CANCELLED trước khi hoàn điểm/coupon.
- Kiểm tra coupon active, hạn sử dụng, cấu hình và quota tại UPDATE.
- `npm run build` tự gọi `prisma generate` nhờ prebuild.

Chạy tại backend: `npm ci`, `npx prisma generate`, `npm run build`, `npm test`.

Lưu ý: chưa xác nhận build và PostgreSQL E2E trong môi trường đóng gói.
