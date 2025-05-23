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

# Accept build arguments for Supabase configuration
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TENANT_ID

# These are passed into the app build (e.g. Next.js static embedding)
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_TENANT_ID=${NEXT_PUBLIC_TENANT_ID}

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy rest of the source
COPY . .

# Build the app
RUN npm run build

# Stage 3: Runtime container
FROM node:20-alpine AS runner
WORKDIR /app

# Disable telemetry
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy necessary runtime files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Expose port for Azure Container App
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
