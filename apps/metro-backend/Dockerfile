# syntax=docker/dockerfile:1

FROM rust:alpine AS rust-builder
WORKDIR /workspace/dataset-handling
COPY dataset-handling/Cargo.toml dataset-handling/Cargo.lock ./
RUN mkdir src \
    && printf 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src
COPY dataset-handling/src ./src
RUN touch src/main.rs && cargo build --release --locked

FROM oven/bun:1-alpine AS bun

FROM node:26-alpine AS base
ENV BUN_INSTALL=/usr/local
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM deps AS prisma-deps
COPY apps/metro-backend/prisma.config.ts ./apps/metro-backend/prisma.config.ts
COPY apps/metro-backend/prisma ./apps/metro-backend/prisma
WORKDIR /workspace/apps/metro-backend
RUN DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public" \
    bun x prisma generate --schema prisma/schema.prisma

FROM prisma-deps AS builder
WORKDIR /workspace
COPY nx.json tsconfig.base.json ./
COPY apps/metro-backend ./apps/metro-backend
COPY libs/shared/environment ./libs/shared/environment
COPY libs/shared/rail-integration-contracts ./libs/shared/rail-integration-contracts
COPY libs/shared/utils ./libs/shared/utils
RUN --mount=type=cache,target=/workspace/.nx/cache \
    bun x nx build metro-backend --configuration=production

FROM base AS production-deps
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
RUN apk add --no-cache dumb-init unzip \
    && addgroup -S app \
    && adduser -S app -G app \
    && mkdir -p /app/temp/gtfs \
    && chown -R app:app /app

COPY --from=rust-builder /workspace/dataset-handling/target/release/metro-dataset-handling /usr/local/bin/gtfs-processor
COPY --from=production-deps --chown=app:app /workspace/node_modules ./node_modules
COPY --from=prisma-deps --chown=app:app /workspace/apps/metro-backend/generated ./generated
COPY --from=prisma-deps --chown=app:app /workspace/apps/metro-backend/prisma.config.ts ./prisma.config.ts
COPY --from=prisma-deps --chown=app:app /workspace/apps/metro-backend/prisma ./prisma
COPY --from=builder --chown=app:app /workspace/dist/apps/metro-backend ./

USER app
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "main.js"]
