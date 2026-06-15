# Use .NET methods to fix encoding for ALL TypeScript files
Add-Type -AssemblyName System.IO

# Get all .ts and .tsx files recursively
Get-ChildItem -Recurse -Include *.ts,*.tsx | ForEach-Object {
    $file = $_.FullName
    try {
        $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
        Write-Host "Fixed $file"
    } catch {
        Write-Host "Error fixing $file : $_"
    }
}

Write-Host "All TypeScript files fixed!"
