@echo off
REM Build APKs for both Collector and Customer apps
REM This script automates the build process for Windows

echo ==========================================
echo Building Majupat Apps
echo ==========================================
echo.

REM Check if EAS CLI is installed
where eas >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing EAS CLI...
    call npm install -g eas-cli
    echo EAS CLI installed
) else (
    echo EAS CLI already installed
)

echo.
echo ==========================================
echo Building Customer App
echo ==========================================
cd customer-app
call eas build --platform android --profile preview
cd ..

echo.
echo ==========================================
echo Building Collector App
echo ==========================================
cd collector-app
call eas build --platform android --profile preview
cd ..

echo.
echo ==========================================
echo Build commands submitted!
echo ==========================================
echo.
echo Monitor your builds at: https://expo.dev
echo You'll receive download links when builds complete.
echo.
pause
