# Mendly, as a container.
#
# Node on Alpine, matching the deployment sketch in the architecture plan. The
# build runs in one stage and the result is copied into a slim runtime stage, so
# the published image does not carry the build toolchain.

FROM node:22-alpine AS base
WORKDIR /app
# Next's SWC binaries are glibc-linked; Alpine needs this shim to load them.
RUN apk add --no-cache libc6-compat

# ---- Dependencies -------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build --------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Copies the MediaPipe wasm runtime and downloads the pose model into public/,
# so a running container serves them from its own origin. The script tolerates
# having no network: the browser then loads the model from the CDN.
RUN node scripts/fetch-cv-assets.mjs || true
RUN npm run build

# ---- Runtime ------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

# Run as a non-root user. Nothing in the image needs to be written at runtime.
RUN addgroup --system --gid 1001 mendly \
 && adduser --system --uid 1001 --ingroup mendly mendly

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# The schema and the migrate/seed scripts run from the container, so the
# sources they need come along.
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

USER mendly
EXPOSE 3000

# The schema is idempotent, so applying it on every start is safe and means a
# fresh database needs no separate step.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
