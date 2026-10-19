FROM node:24.18.0-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.18.0-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3210 FOGO_DB=/app/storage/fogo.db
RUN corepack enable && mkdir -p /app/storage && chown node:node /app/storage
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY src ./src
COPY data/marilia.json data/marilia-roads.json ./data/
USER node
VOLUME /app/storage
EXPOSE 3210
CMD ["node", "src/server/main.ts"]
