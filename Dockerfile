FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/codeexecution-client/package.json ./packages/codeexecution-client/package.json
COPY packages/html-to-pptx/package.json ./packages/html-to-pptx/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY package.json bun.lock ./
EXPOSE 3000
CMD ["bun", "run", "start"]