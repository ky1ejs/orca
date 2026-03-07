#!/bin/sh
set -e
bunx prisma migrate deploy
exec bun run src/index.ts
