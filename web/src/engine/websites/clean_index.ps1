# Save this as clean_index.ps1 and run it from PowerShell
$websitesPath = "e:\DRMRemoval\HakuNeko\haruneko_viz\haruneko\web\src\engine\websites"
$indexFile = "$websitesPath\_index.ts"

Write-Host "Checking for missing modules in _index.ts..." -ForegroundColor Yellow

# Get all .ts files in the main directory (excluding _index.ts)
$mainFiles = Get-ChildItem "$websitesPath\*.ts" -Exclude "_index.ts" | ForEach-Object { $_.BaseName }

# Get all .ts files in the legacy directory
$legacyPath = "$websitesPath\legacy"
$legacyFiles = @()
if (Test-Path $legacyPath) {
    $legacyFiles = Get-ChildItem "$legacyPath\*.ts" | ForEach-Object { $_.BaseName }
}

# Read the index file
$indexContent = Get-Content $indexFile

# Process each line and keep only valid exports
$validExports = @()
$removedCount = 0

foreach ($line in $indexContent) {
    if ($line -match "export\s*\{\s*default\s+as\s+\w+\s*\}\s*from\s*['\`"]\.\/(.+?)['\`"];?") {
        $modulePath = $Matches[1]
        
        if ($modulePath.StartsWith("legacy/")) {
            $fileName = $modulePath.Replace("legacy/", "")
            if ($legacyFiles -contains $fileName) {
                $validExports += $line
            } else {
                Write-Host "Removing missing legacy module: $fileName" -ForegroundColor Red
                $removedCount++
            }
        } else {
            if ($mainFiles -contains $modulePath) {
                $validExports += $line
            } else {
                Write-Host "Removing missing main module: $modulePath" -ForegroundColor Red
                $removedCount++
            }
        }
    } else {
        # Keep comments and other lines
        $validExports += $line
    }
}

# Write the cleaned content back to the file
$validExports | Set-Content $indexFile -Encoding UTF8

Write-Host "`nCleaning completed!" -ForegroundColor Green
Write-Host "Removed $removedCount missing module exports" -ForegroundColor Green
Write-Host "Updated _index.ts file" -ForegroundColor Green