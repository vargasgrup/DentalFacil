ARG NEXT_PUBLIC_API_URL=""
ARG BACKEND_URL=http://localhost:8001

FROM node:18-alpine AS builder

# Re-declare ARGs inside the stage so they inherit the global --build-arg values.
# In Docker multi-stage builds, global ARGs are NOT automatically available
# inside stages unless re-declared here.
ARG NEXT_PUBLIC_API_URL
ARG BACKEND_URL

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL BACKEND_URL=$BACKEND_URL npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

# NEXT_PUBLIC_API_URL is baked into the browser bundle at build time (empty = relative paths).
# BACKEND_URL is used by next.config.js rewrites at build time (server-to-server).
EXPOSE 3001

CMD ["npm", "start", "--", "-p", "3001"]
