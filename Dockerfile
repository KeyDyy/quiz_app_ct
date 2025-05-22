# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
# Copy only package files for faster caching
COPY package.json package-lock.json ./
# Install dependencies
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# KLUCZOWE: NIE ustawiaj NEXT_PUBLIC_* zmiennych podczas budowania
# Zamiast tego, skonfiguruj Next.js żeby nie wbudowywał ich w statyczne pliki

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy rest of the source
COPY . .

# Zbuduj aplikację BEZ ustawiania NEXT_PUBLIC_* zmiennych
# To pozwoli na ich nadpisanie w runtime
RUN npm run build

# Stage 3: Runtime container
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary runtime files
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port for Azure Container App
EXPOSE 3000

# Ustaw port dla Next.js
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the server
CMD ["node", "server.js"]