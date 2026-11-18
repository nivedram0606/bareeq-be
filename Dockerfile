# syntax=docker/dockerfile:1.7
#
# Bareeq Cloud API — production image.
# Build command:
#   docker build -t bareeq-api .
#
# Runs `node dist/server.js` as non-root user.
# Also runs migrations (`node dist/db/migrate.js`) and seed (`node dist/db/seed.js`).

ARG NODE_VERSION=22

# ---------------------------------------------------------------- build stage
FROM node:${NODE_VERSION}-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true HUSKY=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --ignore-scripts

COPY tsconfig.json tsconfig.build.json drizzle.config.ts ./
COPY scripts/ scripts/
COPY src/ src/

RUN pnpm build \
 && pnpm prune --prod

# -------------------------------------------------------------- runtime stage
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
