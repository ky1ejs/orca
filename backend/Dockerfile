FROM oven/bun:1 AS build
WORKDIR /app

# Copy and install all dependencies (including dev)
COPY package.json bun.lockb* ./
RUN bun install

# Copy source and generate Prisma client
COPY . .
RUN bunx prisma generate

FROM oven/bun:1
WORKDIR /app

# Install production dependencies only
COPY package.json bun.lockb* ./
RUN bun install --production

# Copy generated Prisma client from build stage
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy source and Prisma schema (needed for migrations)
COPY src/ ./src/
COPY prisma/ ./prisma/

EXPOSE 4000
CMD ["bun", "run", "start"]
