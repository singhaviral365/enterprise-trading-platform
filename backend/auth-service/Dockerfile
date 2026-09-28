# Multi-stage Dockerfile for Auth Service

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies using npm ci (clean install for reproducibility)
RUN npm ci

# Copy source code
COPY tsconfig*.json ./
COPY src ./src

# Build the application
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port (per contract)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Run the application
CMD ["npm", "run", "start:prod"]
