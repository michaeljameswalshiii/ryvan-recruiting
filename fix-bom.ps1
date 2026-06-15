$file = "C:\Users\micha\Desktop\src\components\candidate\CandidateDetailClient.tsx"
$bytes = [System.IO.File]::ReadAllBytes($file)

# Check for UTF-8 BOM
if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "BOM found, removing..."
    $newBytes = $bytes[3..($bytes.Length-1)]
    [System.IO.File]::WriteAllBytes($file, $newBytes)
    Write-Host "BOM removed"
} else {
    Write-Host "No UTF-8 BOM found"
}

# Also write using UTF8NoBOM to ensure clean encoding
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$utf8NoBOM = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($file, $content, $utf8NoBOM)
Write-Host "File re-encoded with UTF8 No BOM"
