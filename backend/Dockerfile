FROM oven/bun:1 AS base
WORKDIR /app

# Copy and install dependencies (strip @orca/shared — only needed at dev time)
COPY package.json bun.lockb* ./
RUN sed -i '/"@orca\/shared"/d' package.json && bun install

# Copy source (includes schema.graphql copied into backend/ before build)
COPY . .

# Generate Prisma client
RUN bunx prisma generate

ENV SCHEMA_PATH=/app/schema.graphql
EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]
