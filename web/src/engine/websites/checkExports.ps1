# Save this as check_exports.ps1
$websitesPath = "e:\DRMRemoval\HakuNeko\haruneko_viz\haruneko\web\src\engine\websites"
$indexFile = "$websitesPath\_index.ts"

# Get all .ts files in the main directory
$mainFiles = Get-ChildItem "$websitesPath\*.ts" -Exclude "_index.ts" | ForEach-Object { $_.BaseName }

# Get all .ts files in the legacy directory
$legacyFiles = Get-ChildItem "$websitesPath\legacy\*.ts" | ForEach-Object { $_.BaseName }

# Read the index file
$indexContent = Get-Content $indexFile

# Process each line
$validExports = @()
foreach ($line in $indexContent) {
    if ($line -match "export.*from '\./(.+)';") {
        $moduleName = $Matches[1]
        if ($moduleName.StartsWith("legacy/")) {
            $fileName = $moduleName.Replace("legacy/", "")
            if ($legacyFiles -contains $fileName) {
                $validExports += $line
            } else {
                Write-Host "Removing missing legacy module: $fileName"
            }
        } else {
            if ($mainFiles -contains $moduleName) {
                $validExports += $line
            } else {
                Write-Host "Removing missing main module: $moduleName"
            }
        }
    } else {
        $validExports += $line
    }
}

# Write the cleaned content back
$validExports | Set-Content $indexFile
Write-Host "Cleaned _index.ts file"