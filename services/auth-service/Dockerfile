# Multi-stage Dockerfile for Auth Service

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# argon2 is a native module; with no prebuilt binary for Alpine it is compiled here, so the build stage needs Python and a C++ toolchain.
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies using npm ci (clean install for reproducibility)
RUN npm ci

# Copy source code
COPY tsconfig*.json ./
COPY src ./src

# Build the application
RUN npm run build

# Drop the dev dependencies; what is left (argon2 already compiled) is copied into the runtime image.
RUN npm prune --omit=dev

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Production dependencies, compiled in the builder stage (no compiler needed here)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# The port and the health check come from config/application.yml (services.auth.port) through docker-compose.yml, not from this image.

# Use dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Run the application
CMD ["npm", "run", "start:prod"]
