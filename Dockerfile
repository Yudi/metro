# Build
FROM node:alpine AS base

WORKDIR /app

COPY package.json bun.lockb .

FROM base AS install-bun

# https://github.com/oven-sh/bun/issues/5545
RUN apk --no-cache add ca-certificates wget

RUN if [[ $(uname -m) == "aarch64" ]] ; \
    then \
    # aarch64
    wget https://raw.githubusercontent.com/squishyu/alpine-pkg-glibc-aarch64-bin/master/glibc-2.26-r1.apk ; \
    apk add --no-cache --allow-untrusted --force-overwrite glibc-2.26-r1.apk ; \
    rm glibc-2.26-r1.apk ; \
    else \
    # x86_64
    wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.28-r0/glibc-2.28-r0.apk ; \
    wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub ; \
    apk add --no-cache --force-overwrite glibc-2.28-r0.apk ; \
    rm glibc-2.28-r0.apk ; \
    fi
###########

RUN yarn global add bun

FROM install-bun AS prod-deps
RUN bun install --omit=dev --frozen-lockfile

FROM install-bun AS build-deps
RUN bun install --frozen-lockfile

FROM build-deps AS build
COPY . .

RUN bun run build --configuration=production


FROM base AS serve
COPY --from=prod-deps /app/node_modules ./node_modules
WORKDIR /usr/app
COPY --from=build /app/dist/metro ./
CMD node server/server.mjs
EXPOSE 4000
