#!/bin/bash
# Setup DynamoDB Tables for Turnkey Optimization
# Requires: AWS CLI configured with credentials
# Usage: bash scripts/setup-dynamodb.sh

set -e

# Get region from env or default
REGION="${AWS_REGION:-us-east-1}"

echo "Setting up DynamoDB tables..."
echo "Region: $REGION"
echo ""

# Table definitions
# Format: TABLE_NAME PARTITION_KEY SORT_KEY [GSI_INDEX_NAME GSI_PARTITION_KEY GSI_SORT_KEY]

tables=(
  "turnkey-tenants id created_at"
  "turnkey-profiles id email tenant-index tenant_id"
  "turnkey-clients tenant_id id"
  "turnkey-leads tenant_id id email-index email"
  "turnkey-pipeline tenant_id id"
  "turnkey-sources tenant_id id"
)

for table_def in "${tables[@]}"; do
  read -ra parts <<< "$table_def"
  TABLE_NAME="${parts[0]}"
  PARTITION_KEY="${parts[1]}"
  SORT_KEY="${parts[2]}"
  GSI_NAME="${parts[3]:-}"
  GSI_PARTITION_KEY="${parts[4]:-}"
  
  echo "Checking $TABLE_NAME..."
  
  # Check if table exists
  if aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    2>/dev/null > /dev/null; then
    echo "  ✓ Table $TABLE_NAME already exists"
    continue
  fi
  
  echo "  Creating table $TABLE_NAME..."
  
  # Build CLI command
  CMD="aws dynamodb create-table \
    --table-name $TABLE_NAME \
    --attribute-definitions AttributeName=$PARTITION_KEY,AttributeType=S AttributeName=$SORT_KEY,AttributeType=S"
  
  if [ -n "$GSI_NAME" ]; then
    CMD="$CMD AttributeName=$GSI_PARTITION_KEY,AttributeType=S"
  fi
  
  CMD="$CMD --key-schema AttributeName=$PARTITION_KEY,KeyType=HASH AttributeName=$SORT_KEY,KeyType=RANGE"
  
  if [ -n "$GSI_NAME" ]; then
    CMD="$CMD --global-secondary-indexes '{\"IndexName\":\"$GSI_NAME\",\"KeySchema\":[{\"AttributeName\":\"$GSI_PARTITION_KEY\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}'"
  fi
  
  CMD="$CMD --provisioned-throughput '{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}' \
    --region $REGION"
  
  eval $CMD
  
  echo "  ✓ Table $TABLE_NAME created successfully"
done

echo ""
echo "✅ All tables setup complete!"
echo ""
echo "Next steps:"
echo "1. Merge the PR: blackboxai/fix-pipeline-error-handling"
echo "2. Vercel will auto-deploy on merge"
echo "3. Test the pipeline functionality"
