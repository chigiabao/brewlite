FROM node:24-bookworm-slim
WORKDIR /app
ARG DATABASE_URL="postgresql://brew:brew@db:5432/brewlite"
ENV DATABASE_URL=${DATABASE_URL}
COPY package*.json ./
RUN npm ci
COPY . .
# URL giả chỉ phục vụ Prisma generate và build.
# Không kết nối database thật ở bước này.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/brewlite?schema=public" \
    sh -c 'npx prisma generate && npm run build'
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
