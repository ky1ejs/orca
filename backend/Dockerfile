FROM oven/bun:1 AS base
WORKDIR /app

# Copy and install dependencies
COPY package.json bun.lockb* ./
RUN bun install

# Copy source
COPY . .

# Generate Prisma client
RUN bunx prisma generate

EXPOSE 4000
CMD ["bun", "run", "start"]
