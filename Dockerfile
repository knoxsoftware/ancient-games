# Multi-stage Dockerfile for Ancient Games Platform with npm workspaces

# Stage 1: Install dependencies and build all packages
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files for all workspaces
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install all dependencies using workspace
RUN npm ci

# Copy source files
COPY shared/ ./shared/
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build shared types first
RUN npm run build --workspace=shared

# Build backend
RUN npm run build --workspace=backend

# Build frontend
RUN npm run build --workspace=frontend

# Stage 2: Production dependencies
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
# Install production dependencies for backend workspace
RUN npm ci --omit=dev --workspace=backend

# Stage 3: Production image
FROM node:18-alpine AS production
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package.json files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Copy node_modules from deps stage (installed at root for workspace)
COPY --from=deps /app/node_modules ./node_modules

# Copy built files with nodejs ownership
COPY --chown=nodejs:nodejs --from=builder /app/backend/dist ./backend/dist
COPY --chown=nodejs:nodejs --from=builder /app/frontend/dist ./frontend/dist

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "backend/dist/server.js"]
