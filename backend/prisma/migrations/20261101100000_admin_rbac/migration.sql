-- FIX 10: role mặc định CUSTOMER, không tự động nâng quyền các tài khoản đang có.
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER';
