@echo off
REM Open the clinic UI in the default browser (same PC as the Server).
setlocal EnableExtensions

set URL_HTTPS=https://127.0.0.1:8001/
set URL_HTTP=http://127.0.0.1:8001/

if exist "%ProgramData%\NKDentalSoft\certs\server.crt" (
  start "" "%URL_HTTPS%"
) else (
  start "" "%URL_HTTP%"
)

exit /b 0
