FROM oven/bun:1 AS base
WORKDIR /app

# Copy and install dependencies (strip @orca/shared — only needed at dev time)
COPY package.json bun.lockb* ./
RUN sed -i '/"@orca\/shared"/d' package.json && bun install

# Copy source
COPY . .

# Copy schema from shared (placed here by CI or manually)
# In local dev, schema.graphql is read from ../shared/src/schema.graphql
# In Docker, it's at /app/schema.graphql via SCHEMA_PATH env var
COPY schema.graphql /app/schema.graphql

# Generate Prisma client
RUN bunx prisma generate

ENV SCHEMA_PATH=/app/schema.graphql
EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]
