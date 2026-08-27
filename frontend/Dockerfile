FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `public/` is optional in Next.js, but the runner stage copies it
# unconditionally — and Git does not track empty directories, so a fresh
# clone without this line failed the build outright at that COPY.
RUN mkdir -p public

# NEXT_PUBLIC_* values are inlined into the client bundle at build time,
# so they must be supplied as build args (not just runtime env vars).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID
ARG NEXT_PUBLIC_GITHUB_OAUTH_REDIRECT_URI
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GITHUB_CLIENT_ID=$NEXT_PUBLIC_GITHUB_CLIENT_ID \
    NEXT_PUBLIC_GITHUB_OAUTH_REDIRECT_URI=$NEXT_PUBLIC_GITHUB_OAUTH_REDIRECT_URI

RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
# Next's standalone server binds to $HOSTNAME, which Docker sets to the
# container id — so it listened on exactly one interface and nothing
# inside the container could reach it on localhost. Reachable from Nginx
# by container IP either way, but it made the healthcheck impossible and
# the binding needlessly narrow.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN adduser --disabled-password --no-create-home velora
COPY --from=builder /app/public ./public
COPY --from=builder --chown=velora:velora /app/.next/standalone ./
COPY --from=builder --chown=velora:velora /app/.next/static ./.next/static

USER velora
EXPOSE 3000
CMD ["node", "server.js"]
