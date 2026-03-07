FROM oven/bun:1 AS base
WORKDIR /app

# Copy shared package
COPY shared/package.json shared/bun.lockb* ./shared/
RUN cd shared && bun install --frozen-lockfile
COPY shared/ ./shared/

# Copy backend package
COPY backend/package.json backend/bun.lockb* ./backend/
RUN cd backend && bun install --frozen-lockfile
COPY backend/ ./backend/

# Generate Prisma client
RUN cd backend && bunx prisma generate

WORKDIR /app/backend
EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]
