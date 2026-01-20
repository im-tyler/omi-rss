@echo off
REM Build script for Omi RSS Extension

echo Building Omi RSS Extension...

REM Create build directories
if not exist "build\chrome" mkdir "build\chrome"
if not exist "build\firefox" mkdir "build\firefox"
if not exist "build\brave" mkdir "build\brave"

REM Copy common files
echo Copying common files...
xcopy /E /I /Y css "build\chrome\css"
xcopy /E /I /Y css "build\firefox\css"
xcopy /E /I /Y js "build\chrome\js"
xcopy /E /I /Y js "build\firefox\js"
xcopy /E /I /Y icons "build\chrome\icons"
xcopy /E /I /Y icons "build\firefox\icons"
copy /Y *.html "build\chrome\"
copy /Y *.html "build\firefox\"

REM Copy Chrome manifest
echo Building Chrome version...
copy /Y manifest.json "build\chrome\"

REM Copy Firefox manifest
echo Building Firefox version...
copy /Y manifest_firefox.json "build\firefox\manifest.json"

REM Copy Brave manifest and optimize for Brave
echo Building Brave version...
copy /Y manifest_brave.json "build\brave\manifest.json"
xcopy /E /I /Y css "build\brave\css"
xcopy /E /I /Y js "build\brave\js"
xcopy /E /I /Y icons "build\brave\icons"
copy /Y *.html "build\brave\"
copy /Y BRAVE_USERS.md "build\brave\"

REM Add Brave detection script
echo console.log("Brave Edition loaded"); > "build\brave\js\brave-init.js"

REM Create zip files using PowerShell
echo Creating extension packages...
powershell -Command "Compress-Archive -Path 'build\chrome\*' -DestinationPath 'build\omi-rss-chrome.zip' -Force"
powershell -Command "Compress-Archive -Path 'build\firefox\*' -DestinationPath 'build\omi-rss-firefox.zip' -Force"
powershell -Command "Compress-Archive -Path 'build\brave\*' -DestinationPath 'build\omi-rss-brave.zip' -Force"

echo Build complete!
echo Chrome extension: build\omi-rss-chrome.zip
echo Firefox extension: build\omi-rss-firefox.zip
echo Brave extension: build\omi-rss-brave.zip
pause