#!/bin/bash

# Build APKs for both Collector and Customer apps
# This script automates the build process

echo "=========================================="
echo "Building Majupat Apps"
echo "=========================================="
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null
then
    echo "❌ EAS CLI not found. Installing..."
    npm install -g eas-cli
    echo "✅ EAS CLI installed"
else
    echo "✅ EAS CLI already installed"
fi

echo ""
echo "=========================================="
echo "Building Customer App"
echo "=========================================="
cd customer-app
eas build --platform android --profile preview --non-interactive || eas build --platform android --profile preview
cd ..

echo ""
echo "=========================================="
echo "Building Collector App"
echo "=========================================="
cd collector-app
eas build --platform android --profile preview --non-interactive || eas build --platform android --profile preview
cd ..

echo ""
echo "=========================================="
echo "✅ Build commands submitted!"
echo "=========================================="
echo ""
echo "Monitor your builds at: https://expo.dev"
echo "You'll receive download links when builds complete."
echo ""
