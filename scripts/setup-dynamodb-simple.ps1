# Simplified DynamoDB Setup Script
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\setup-dynamodb-simple.ps1

$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Setting up DynamoDB tables (simplified)..." -ForegroundColor Cyan
Write-Host "Region: $Region"
Write-Host ""

$tables = @(
    @{Name="turnkey-tenants"; PK="id"; SK="created_at"},
    @{Name="turnkey-profiles"; PK="id"; SK="email"},
    @{Name="turnkey-clients"; PK="tenant_id"; SK="id"},
    @{Name="turnkey-leads"; PK="tenant_id"; SK="id"},
    @{Name="turnkey-pipeline"; PK="tenant_id"; SK="id"},
    @{Name="turnkey-sources"; PK="tenant_id"; SK="id"}
)

foreach ($t in $tables) {
    Write-Host ("Checking {0}..." -f $t.Name) -NoNewline
    
    # Check if exists
    $check = aws dynamodb describe-table --table-name $t.Name --region $Region 2>$null
    if ($check -and $LASTEXITCODE -eq 0) {
        Write-Host " Already exists" -ForegroundColor Green
        continue
    }
    
    Write-Host " Creating..." -NoNewline
    
    # Create table
    $cmd = "aws dynamodb create-table --table-name {0} --attribute-definitions AttributeName={1},AttributeType=S AttributeName={2},AttributeType=S --key-schema AttributeName={1},KeyType=HASH AttributeName={2},KeyType=RANGE --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 --region {3}" -f $t.Name, $t.PK, $t.SK, $Region
    
    aws dynamodb create-table --table-name $t.Name `
        --attribute-definitions "AttributeName=$($t.PK),AttributeType=S" "AttributeName=$($t.SK),AttributeType=S" `
        --key-schema "AttributeName=$($t.PK),KeyType=HASH" "AttributeName=$($t.SK),KeyType=RANGE" `
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 `
        --region $Region 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host " Created" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done! Tables should be created shortly (DynamoDB is async)." -ForegroundColor Cyan
Write-Host "Wait 30 seconds before testing."
