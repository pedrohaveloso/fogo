FROM node:24.18.0-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && find src -name "*.test.ts" -delete && rm src/server/test-fixtures.ts

FROM node:24.18.0-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3210 FOGO_DB=/app/storage/fogo.db
RUN corepack enable && mkdir -p /app/storage && chown node:node /app/storage
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY data/marilia.json data/marilia-roads.json ./data/
USER node
VOLUME /app/storage
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3210/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/server/main.ts"]
