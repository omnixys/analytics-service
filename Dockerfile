# Build from the Omnixys checkout root:
# docker build -f services/analytics-service/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable

COPY packages/ts ./packages/ts
COPY services/analytics-service ./services/analytics-service

RUN for package in \
      contracts context logger observability security cache graphql http kafka analytics-rule-engine; do \
      pnpm --dir "/workspace/packages/ts/$package" install --frozen-lockfile; \
      pnpm --dir "/workspace/packages/ts/$package" run build; \
    done

WORKDIR /workspace/services/analytics-service
RUN pnpm install --frozen-lockfile \
  && pnpm run prisma:generate \
  && pnpm run build \
  && pnpm prune --prod

RUN find /workspace/packages/ts -name node_modules -type d -prune -exec rm -rf '{}' '+'

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace/services/analytics-service
RUN groupadd --system analytics && useradd --system --gid analytics analytics
COPY --from=build --chown=analytics:analytics /workspace/packages/ts /workspace/packages/ts
COPY --from=build --chown=analytics:analytics /workspace/services/analytics-service/package.json ./
COPY --from=build --chown=analytics:analytics /workspace/services/analytics-service/node_modules ./node_modules
COPY --from=build --chown=analytics:analytics /workspace/services/analytics-service/dist ./dist
RUN ln -s /workspace/services/analytics-service/node_modules /workspace/node_modules
USER analytics
EXPOSE 7410 9470
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7410/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
