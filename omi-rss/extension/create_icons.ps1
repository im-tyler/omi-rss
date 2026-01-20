# PowerShell script to create placeholder PNG icons
# Run this script in the browser_extension directory

# Create icons directory if it doesn't exist
if (!(Test-Path "icons")) {
    New-Item -ItemType Directory -Path "icons"
}

# Base64 encoded 1x1 orange PNG (matches the #ff6b00 color from SVG)
$orangePixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

# Convert base64 to bytes
$bytes = [Convert]::FromBase64String($orangePixel)

# Create each icon size (they'll all be 1x1 but Chrome will accept them)
$sizes = @("16", "32", "48", "128")

foreach ($size in $sizes) {
    $filename = "icons\icon-$size.png"
    [System.IO.File]::WriteAllBytes("$PSScriptRoot\$filename", $bytes)
    Write-Host "Created $filename"
}

Write-Host "`nPlaceholder icons created successfully!"
Write-Host "Note: For production use, replace these with properly sized icons."