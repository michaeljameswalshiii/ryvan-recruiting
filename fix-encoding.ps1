# Use .NET methods to fix encoding
Add-Type -AssemblyName System.IO

$files = @(
    ".\src\components\candidate\CandidateDetailClient.tsx",
    ".\src\app\dashboard\candidates\[id]\page.tsx"
)

foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Fixed $file"
}

Write-Host "All files fixed!"
