ARG BACKEND_URL=http://localhost:8001

FROM node:18-alpine AS builder

ARG BACKEND_URL

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# IMPORTANT: do NOT bake NEXT_PUBLIC_API_URL into the client bundle.
# Railway injects service vars as build-args; if NEXT_PUBLIC_API_URL points at the
# public backend, the browser does cross-origin fetch → "Failed to fetch"/CORS.
# Browser always calls same-origin /api/... ; route handler proxies via BACKEND_URL.
ENV NEXT_PUBLIC_API_URL=
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3001

CMD ["npm", "start"]
