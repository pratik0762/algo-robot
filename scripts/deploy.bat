@echo off
REM =====================================================================
REM Algo Robot - Windows Production Deployment & Verification Script
REM =====================================================================
echo =================================================================
echo ALGO ROBOT - WINDOWS PRODUCTION DEPLOYMENT
echo =================================================================

if not exist ".env.production" (
    echo Creating .env.production from example template...
    copy ".env.production.example" ".env.production"
)

echo.
echo --- 1. Building and Launching Docker Containers ---
where docker-compose >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    docker-compose build
    docker-compose up -d
) else (
    docker compose build
    docker compose up -d
)

echo.
echo --- 2. Awaiting Service Health Stabilization ---
timeout /t 5 /nobreak >nul

echo Checking Backend Health...
curl -s -o nul -w "Backend Status: %%{http_code}\n" http://127.0.0.1:8000/

echo Checking Frontend Health...
curl -s -o nul -w "Frontend Status: %%{http_code}\n" http://127.0.0.1:3000/

echo Checking Nginx Ingress...
curl -s -o nul -w "Nginx Status: %%{http_code}\n" http://127.0.0.1/

echo.
echo =================================================================
echo DEPLOYMENT READY! Access Algo Robot on http://localhost
echo =================================================================
