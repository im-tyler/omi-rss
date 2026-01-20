@echo off
REM Build script for RSS Glassmorphism Reader Chrome Extension

echo Building Flutter web for extension...
cd ../..

REM Build Flutter web
call flutter build web --web-renderer html --csp

REM Create extension directory if it doesn't exist
if not exist "build\web\extension" mkdir "build\web\extension"

REM Copy extension files
echo Copying extension files...
xcopy /Y /E "web\extension\*" "build\web\extension\"

REM Create icons directory if it doesn't exist
if not exist "build\web\extension\icons" mkdir "build\web\extension\icons"

REM Copy Flutter web build to extension
echo Copying Flutter build...
xcopy /Y /E "build\web\*" "build\web\extension\flutter\" /EXCLUDE:web\extension\exclude.txt

REM Update manifest for production
echo Updating manifest...
powershell -Command "(Get-Content 'build\web\extension\manifest.json') -replace '\"flutter/\*\"', '\"flutter/**/*\"' | Set-Content 'build\web\extension\manifest.json'"

REM Create ZIP file for Chrome Web Store
echo Creating extension package...
powershell Compress-Archive -Path "build\web\extension\*" -DestinationPath "build\rss_reader_extension.zip" -Force

echo.
echo Build complete!
echo Extension files are in: build\web\extension\
echo Chrome Web Store package: build\rss_reader_extension.zip
echo.
echo To test the extension:
echo 1. Open Chrome and go to chrome://extensions/
echo 2. Enable Developer mode
echo 3. Click "Load unpacked" and select the build\web\extension\ directory
pause