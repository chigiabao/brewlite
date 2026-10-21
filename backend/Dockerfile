FROM node:24-bookworm-slim
# NestJS 12 tooling/Prisma 7 trong lockfile yêu cầu Node mới; openssl cho Prisma CLI.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# URL giả chỉ phục vụ Prisma generate và build.
# Không kết nối database thật ở bước này.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/brewlite?schema=public" \
    sh -c 'npx prisma generate && npm run build'
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
