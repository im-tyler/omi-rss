#!/bin/bash

# Build script for RSS Glassmorphism Reader Chrome Extension

echo "Building Flutter web for extension..."
cd ../..

# Build Flutter web
flutter build web --web-renderer html --csp

# Create extension directory if it doesn't exist
mkdir -p build/web/extension

# Copy extension files
echo "Copying extension files..."
cp -r web/extension/* build/web/extension/

# Create icons directory if it doesn't exist
mkdir -p build/web/extension/icons

# Copy Flutter web build to extension
echo "Copying Flutter build..."
mkdir -p build/web/extension/flutter
rsync -av --exclude='extension' build/web/ build/web/extension/flutter/

# Update manifest for production
echo "Updating manifest..."
sed -i '' 's/"flutter\/\*"/"flutter\/**\/*"/g' build/web/extension/manifest.json

# Create ZIP file for Chrome Web Store
echo "Creating extension package..."
cd build/web/extension
zip -r ../../rss_reader_extension.zip .
cd ../../..

echo
echo "Build complete!"
echo "Extension files are in: build/web/extension/"
echo "Chrome Web Store package: build/rss_reader_extension.zip"
echo
echo "To test the extension:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable Developer mode"
echo "3. Click 'Load unpacked' and select the build/web/extension/ directory"