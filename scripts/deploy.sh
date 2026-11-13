#!/usr/bin/env bash
# =====================================================================
# Algo Robot - One-Click Production Deployment Script
# =====================================================================
set -e

echo "================================================================="
echo "ALGO ROBOT - PRODUCTION DEPLOYMENT & HEALTH VERIFICATION"
echo "================================================================="

# 1. Environment Verification
if [ ! -f .env.production ]; then
    echo "Creating .env.production from example template..."
    cp .env.production.example .env.production
fi

# 2. Build and Launch Containers
echo "\n--- 1. Building and Launching Docker Containers ---"
docker compose build --parallel
docker compose up -d

# 3. Wait for Services to become healthy
echo "\n--- 2. Awaiting Service Health Stabilization ---"
sleep 5

# Check Backend Health
echo -n "Checking Backend (http://localhost:8000/) ... "
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/ || true)
if [ "$BACKEND_STATUS" = "200" ]; then
    echo "✓ HEALTHY (200 OK)"
else
    echo "✗ FAILED (Status: $BACKEND_STATUS)"
    docker compose logs backend
    exit 1
fi

# Check Frontend Health
echo -n "Checking Frontend (http://localhost:3000/) ... "
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ || true)
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo "✓ HEALTHY (200 OK)"
else
    echo "✗ FAILED (Status: $FRONTEND_STATUS)"
    docker compose logs frontend
    exit 1
fi

# Check Nginx Ingress
echo -n "Checking Nginx Proxy Ingress (http://localhost/) ... "
NGINX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ || true)
if [ "$NGINX_STATUS" = "200" ]; then
    echo "✓ HEALTHY (200 OK)"
else
    echo "✗ FAILED (Status: $NGINX_STATUS)"
fi

echo "\n================================================================="
echo "DEPLOYMENT COMPLETE! Algo Robot is live on http://localhost"
echo "================================================================="
