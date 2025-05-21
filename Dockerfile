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

# Use placeholder build-time values, do not rely on real secrets
ARG NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-key
ARG TENANT_ID=placeholder

# These are passed into the app build (e.g. Next.js static embedding)
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV TENANT_ID=${TENANT_ID}

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy rest of the source
COPY . .

# Build the app – if using Next.js, this will embed the NEXT_PUBLIC_ vars into static assets
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

# Start the server – ensure your app uses runtime envs like process.env.DATABASE_URL etc.
CMD ["node", "server.js"]
