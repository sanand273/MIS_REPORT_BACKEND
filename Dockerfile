# Stage 1: Build & Environment setup
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript
RUN npm run build

# Stage 2: Production release
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JS files
COPY --from=builder /usr/src/app/dist ./dist

# Environment defaults
EXPOSE 5000
ENV NODE_ENV=production

CMD ["npm", "start"]
