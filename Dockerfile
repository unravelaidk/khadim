FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/codeexecution-client/package.json ./packages/codeexecution-client/package.json
COPY packages/html-to-pptx/package.json ./packages/html-to-pptx/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml server.ts ./
COPY packages ./packages
EXPOSE 3000
CMD ["pnpm", "start"]
