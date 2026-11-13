@echo off
REM =====================================================================
REM Generate Self-Signed SSL Certificate for Windows
REM =====================================================================
if not exist "nginx\ssl" mkdir "nginx\ssl"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 ^
  -keyout "nginx\ssl\server.key" ^
  -out "nginx\ssl\server.crt" ^
  -subj "/C=IN/ST=Maharashtra/L=Mumbai/O=AlgoRobot/OU=Trading/CN=algo-robot.local"

if %ERRORLEVEL% EQU 0 (
    echo SSL Certificate generated in nginx\ssl\
) else (
    echo OpenSSL not in PATH. Generating via PowerShell...
    powershell -Command "New-SelfSignedCertificate -DnsName 'algo-robot.local' -CertStoreLocation 'cert:\LocalMachine\My'"
)
