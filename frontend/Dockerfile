FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

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
ENV NODE_ENV=production

RUN adduser --disabled-password --no-create-home velora
COPY --from=builder /app/public ./public
COPY --from=builder --chown=velora:velora /app/.next/standalone ./
COPY --from=builder --chown=velora:velora /app/.next/static ./.next/static

USER velora
EXPOSE 3000
CMD ["node", "server.js"]
