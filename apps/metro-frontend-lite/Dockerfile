# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS bun

FROM node:26-alpine AS base
ENV BUN_INSTALL=/usr/local
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM deps AS builder
ENV NG_BUILD_MAX_WORKERS=1 \
    NODE_OPTIONS=--max-old-space-size=3072
COPY nx.json tsconfig.base.json ./
COPY apps/metro-frontend-lite ./apps/metro-frontend-lite
COPY libs/shared/api ./libs/shared/api
COPY libs/shared/assets ./libs/shared/assets
COPY libs/shared/environment ./libs/shared/environment
COPY libs/shared/firebase ./libs/shared/firebase
COPY libs/shared/geolocation ./libs/shared/geolocation
COPY libs/shared/lite-ui ./libs/shared/lite-ui
COPY libs/shared/seo ./libs/shared/seo
COPY libs/shared/storybook-mocks ./libs/shared/storybook-mocks
COPY libs/shared/utils ./libs/shared/utils
RUN --mount=type=cache,target=/workspace/.nx/cache \
    bun x nx build metro-frontend-lite --configuration=production

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /workspace/dist/apps/metro-frontend-lite ./
COPY --from=builder --chown=app:app /workspace/dist/apps/metro-frontend-lite/3rdpartylicenses.txt ./browser/3rdpartylicenses.txt
USER app
EXPOSE 4000
CMD ["node", "server/server.mjs"]
