<#
QuickSight Setup Script for Windows
Run this in PowerShell after you have subscribed to QuickSight Enterprise
#>

$ErrorActionPreference = "Stop"

Write-Host "=== QuickSight Setup ===" -ForegroundColor Cyan
Write-Host ""

# Get AWS account info
$accountId = aws sts get-caller-identity --query "Account" --output text 2>$null
if (-not $accountId) {
    Write-Host "ERROR: AWS CLI not configured. Run 'aws configure' first." -ForegroundColor Red
    exit 1
}

$region = $env:AWS_REGION
if (-not $region) {
    $region = "us-east-1"
}

Write-Host "Account: $accountId" -ForegroundColor Green
Write-Host "Region:  $region" -ForegroundColor Green
Write-Host ""

# =====================================================================
# Step 1: Create IAM Role for QuickSight Embedding
# =====================================================================
Write-Host "Step 1: Creating IAM role for QuickSight embedding..." -ForegroundColor Yellow

$roleExists = $false
try {
    aws iam get-role --role-name QuickSightEmbeddingRole 2>$null | Out-Null
    $roleExists = $true
} catch {
    $roleExists = $false
}

if (-not $roleExists) {
    # Create trust policy
    $trustPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "quicksight.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalAccount": "$accountId"
        }
      }
    }
  ]
}
"@

    # Write to temp file (UTF-8 with BOM for Windows compatibility)
    $tempFile = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tempFile, $trustPolicy, $utf8NoBom)

    aws iam create-role `
        --role-name QuickSightEmbeddingRole `
        --description "Role for QuickSight dashboard embedding" `
        --assume-role-policy-document "file://$tempFile" 2>$null

    Remove-Item $tempFile -Force

    Write-Host "  ✓ Created role: QuickSightEmbeddingRole" -ForegroundColor Green
} else {
    Write-Host "  ✓ Role already exists: QuickSightEmbeddingRole" -ForegroundColor Green
}

# =====================================================================
# Step 2: Attach QuickSight Policy to Role
# =====================================================================
Write-Host "Step 2: Attaching QuickSight policy..." -ForegroundColor Yellow

$policyDocument = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "quicksight:GenerateEmbedUrl",
        "quicksight:GetDashboard",
        "quicksight:ListDashboards",
        "quicksight:ListAnalyses",
        "quicksight:ListDatasources",
        "quicksight:ListDatasets"
      ],
      "Resource": "arn:aws:quicksight:${region}:${accountId}:dashboard/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "quicksight:GenerateEmbedUrl",
        "quicksight:GetDashboard",
        "quicksight:ListDashboards"
      ],
      "Resource": "arn:aws:quicksight:${region}:${accountId}:analysis/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "quicksight:DescribeNamespace",
        "quicksight:DescribeUser"
      ],
      "Resource": "arn:aws:quicksight:${region}:${accountId}:namespace/default"
    },
    {
      "Effect": "Allow",
      "Action": "quicksight:ListNamespaces",
      "Resource": "*"
    }
  ]
}
"@

# Delete existing policy if it exists
try {
    aws iam delete-role-policy --role-name QuickSightEmbeddingRole --policy-name QuickSightEmbedPolicy 2>$null
} catch {
    # Policy may not exist, ignore error
}

# Write policy to temp file
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $policyDocument, $utf8NoBom)

aws iam put-role-policy `
    --role-name QuickSightEmbeddingRole `
    --policy-name QuickSightEmbedPolicy `
    --policy-document "file://$tempFile" 2>$null

Remove-Item $tempFile -Force

Write-Host "  ✓ Attached QuickSight policy" -ForegroundColor Green

# =====================================================================
# Step 3: Create Athena Workgroup (if not exists)
# =====================================================================
Write-Host "Step 3: Checking Athena workgroup..." -ForegroundColor Yellow

$workgroupExists = $false
try {
    $wg = aws athena get-work-group --work-group "turnkey-analytics" 2>$null
    if ($wg) {
        $workgroupExists = $true
    }
} catch {
    $workgroupExists = $false
}

if (-not $workgroupExists) {
    Write-Host "  Note: Create Athena workgroup manually in console if needed" -ForegroundColor Yellow
}

# Get role ARN
$roleArn = aws iam get-role --role-name QuickSightEmbeddingRole --query "Role.Arn" --output text 2>$null

# =====================================================================
# Summary
# =====================================================================
Write-Host ""
Write-Host "=== QuickSight Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Role ARN: $roleArn" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS (Manual):" -ForegroundColor Yellow
Write-Host "==================="
Write-Host "1. Sign up for QuickSight Enterprise:" -ForegroundColor White
Write-Host "   https://quicksight.aws.amazon.com/"
Write-Host ""
Write-Host "2. In QuickSight console:" -ForegroundColor White
Write-Host "   - Go to Athena"
Write-Host "   - Connect to your DynamoDB tables (run Glue crawler first)"
Write-Host "   - Create a new analysis"
Write-Host "   - Create visualizations"
Write-Host "   - Publish dashboard"
Write-Host ""
Write-Host "3. Add these to your .env.local:" -ForegroundColor White
Write-Host ""
Write-Host "AWS_QUICKSIGHT_REGION=$region"
Write-Host "AWS_QUICKSIGHT_ACCOUNT_ID=$accountId"
Write-Host "AWS_QUICKSIGHT_EMBED_ROLE_ARN=$roleArn"
Write-Host "AWS_QUICKSIGHT_NAMESPACE=default"
Write-Host ""

# Add to .env.local if it exists
$envFile = ".env.local"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
    
    if ($envContent -notmatch "AWS_QUICKSIGHT") {
        $envAdditions = @"

# QuickSight Reporting
AWS_QUICKSIGHT_REGION=$region
AWS_QUICKSIGHT_ACCOUNT_ID=$accountId
AWS_QUICKSIGHT_EMBED_ROLE_ARN=$roleArn
AWS_QUICKSIGHT_NAMESPACE=default
"@
        Add-Content $envFile $envAdditions
        Write-Host "✓ Added QuickSight env vars to .env.local" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Run this to deploy:" -ForegroundColor Cyan
Write-Host "  .\setup-quicksight.ps1" -ForegroundColor White
