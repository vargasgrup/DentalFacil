ARG NEXT_PUBLIC_API_URL=""
ARG BACKEND_URL=http://localhost:8001

FROM node:18-alpine AS builder

ARG NEXT_PUBLIC_API_URL
ARG BACKEND_URL

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Railway injects PORT at runtime; Next.js reads it automatically
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3001

# Do not hardcode -p: Railway sets PORT dynamically
CMD ["npm", "start"]
