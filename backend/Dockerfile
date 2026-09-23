FROM node:22-alpine
WORKDIR /app
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci
COPY prisma ./prisma
COPY backend ./backend
RUN npx prisma generate --schema=prisma/schema.prisma && npm run build --workspace backend
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && npm start --workspace backend"]
