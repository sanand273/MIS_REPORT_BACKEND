# Stage 1: Build & Environment setup
FROM node:20-alpine AS builder

# Install Python3 and build-essentials required for reportlab/openpyxl
RUN apk add --no-cache python3 py3-pip g++ make gcc python3-dev

# Create a virtual environment for Python dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install report generation libraries
RUN pip install --no-cache-dir pymongo openpyxl reportlab python-dateutil

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript
RUN npm run build

# Stage 2: Production release
FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip

# Copy python virtualenv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JS files and python report runner
COPY --from=builder /usr/src/app/dist ./dist
COPY ./generate_credit_outstanding_pharmacy_report.py ./generate_credit_outstanding_pharmacy_report.py

# Environment defaults
EXPOSE 5000
ENV NODE_ENV=production

CMD ["npm", "start"]
