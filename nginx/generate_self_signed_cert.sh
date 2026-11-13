#!/usr/bin/env bash
# =====================================================================
# Generate Self-Signed SSL Certificate for Local / Staging Testing
# =====================================================================
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/server.key \
  -out nginx/ssl/server.crt \
  -subj "/C=IN/ST=Maharashtra/L=Mumbai/O=AlgoRobot/OU=Trading/CN=algo-robot.local"

echo "SSL Certificate generated in nginx/ssl/"
