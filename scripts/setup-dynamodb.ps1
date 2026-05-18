# Setup DynamoDB Tables for Turnkey Optimization
# Requires: AWS CLI configured with credentials
# Usage: Run in PowerShell: .\scripts\setup-dynamodb.ps1

$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Setting up DynamoDB tables..." -ForegroundColor Cyan
Write-Host "Region: $Region"
Write-Host ""

# Table configurations
$tables = @()

# turnkey-tenants
$t = @{}
$t.TableName = if ($env:DYNAMODB_TENANTS_TABLE) { $env:DYNAMODB_TENANTS_TABLE } else { "turnkey-tenants" }
$t.PartitionKey = "id"
$t.SortKey = "created_at"
$tables += $t

# turnkey-profiles
$t = @{}
$t.TableName = if ($env:DYNAMODB_PROFILES_TABLE) { $env:DYNAMODB_PROFILES_TABLE } else { "turnkey-profiles" }
$t.PartitionKey = "id"
$t.SortKey = "email"
$t.GSI = @(@{IndexName="tenant-index"; PartitionKey="tenant_id"})
$tables += $t

# turnkey-clients
$t = @{}
$t.TableName = if ($env:DYNAMODB_CLIENTS_TABLE) { $env:DYNAMODB_CLIENTS_TABLE } else { "turnkey-clients" }
$t.PartitionKey = "tenant_id"
$t.SortKey = "id"
$tables += $t

# turnkey-leads
$t = @{}
$t.TableName = if ($env:DYNAMODB_LEADS_TABLE) { $env:DYNAMODB_LEADS_TABLE } else { "turnkey-leads" }
$t.PartitionKey = "tenant_id"
$t.SortKey = "id"
$t.GSI = @(@{IndexName="email-index"; PartitionKey="email"})
$tables += $t

# turnkey-pipeline
$t = @{}
$t.TableName = if ($env:DYNAMODB_PIPELINE_TABLE) { $env:DYNAMODB_PIPELINE_TABLE } else { "turnkey-pipeline" }
$t.PartitionKey = "tenant_id"
$t.SortKey = "id"
$tables += $t

# turnkey-sources
$t = @{}
$t.TableName = if ($env:DYNAMODB_SOURCES_TABLE) { $env:DYNAMODB_SOURCES_TABLE } else { "turnkey-sources" }
$t.PartitionKey = "tenant_id"
$t.SortKey = "id"
$tables += $t

foreach ($table in $tables) {
    $tableName = $table.TableName
    
    Write-Host ("Checking {0}..." -f $tableName) -NoNewline
    
    # Check if table exists
    try {
        $existing = aws dynamodb describe-table --table-name $tableName --region $Region 2>$null
        if ($existing -and $existing -notmatch "An error occurred") {
            Write-Host " Already exists" -ForegroundColor Green
            continue
        }
    } catch {
        # Table doesn't exist, continue to create
    }
    
    Write-Host " Creating..." -NoNewline
    
    # Build attributes
    $attrs = @(
        ("AttributeName={0},AttributeType=S" -f $table.PartitionKey),
        ("AttributeName={0},AttributeType=S" -f $table.SortKey)
    )
    
    # Add GSI attributes if present
    if ($table.GSI) {
        foreach ($gsi in $table.GSI) {
            $attrs += ("AttributeName={0},AttributeType=S" -f $gsi.PartitionKey)
        }
    }
    
    $attrsStr = $attrs -join " "
    
    # Build key-schema
    $keySchema = "AttributeName={0},KeyType=HASH AttributeName={1},KeyType=RANGE" -f $table.PartitionKey, $table.SortKey
    
    # Base command
    $cmd = "aws dynamodb create-table --table-name {0} --attribute-definitions {1} --key-schema {2} --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 --region {3}" -f $tableName, $attrsStr, $keySchema, $Region
    
    # Add GSI if present
    if ($table.GSI) {
        $gsiArray = @()
        foreach ($gsi in $table.GSI) {
            $gsiJson = "{{`"IndexName`":`"{0}`",`"KeySchema`":[{{`"AttributeName`":`"{1}`",`"KeyType`":`"HASH`"}}],`"Projection`":{{`"ProjectionType`":`"ALL`"}},`"ProvisionedThroughput`":{{`"ReadCapacityUnits`":5,`"WriteCapacityUnits`":5}}}}" -f $gsi.IndexName, $gsi.PartitionKey
            $gsiArray += $gsiJson
        }
        $gsiStr = "[" + ($gsiArray -join ",") + "]"
        $cmd += " --global-secondary-indexes $gsiStr"
    }
    
    # Execute command
    $result = Invoke-Expression $cmd 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host " Created successfully" -ForegroundColor Green
    } else {
        Write-Host " Failed to create" -ForegroundColor Red
        Write-Host $result
    }
}

Write-Host ""
Write-Host "All tables setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Merge the PR: blackboxai/fix-pipeline-error-handling"
Write-Host "2. Vercel will auto-deploy on merge"
Write-Host "3. Test the pipeline functionality"
