FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY backend/package.json ./backend/package.json
RUN npm install
COPY prisma ./prisma
COPY backend ./backend
RUN npx prisma generate --schema=prisma/schema.prisma && npm run build --workspace backend
EXPOSE 4000
CMD npx prisma migrate deploy --schema=prisma/schema.prisma && npm start --workspace backend