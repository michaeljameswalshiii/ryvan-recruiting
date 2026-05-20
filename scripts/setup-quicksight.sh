#!/bin/bash
# QuickSight Setup Script
# Run this after you have subscribed to QuickSight Enterprise

set -e

echo "=== QuickSight Setup ==="
echo ""

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
REGION=${AWS_REGION:-us-east-1}

echo "Account: $ACCOUNT_ID"
echo "Region: $REGION"
echo ""

# =====================================================================
# Step 1: Create IAM Role for QuickSight Embedding
# =====================================================================
echo "Step 1: Creating IAM role for QuickSight embedding..."

# Check if role already exists
ROLE_EXISTS=$(aws iam get-role --role-name QuickSightEmbeddingRole 2>/dev/null && echo "yes" || echo "no")

if [ "$ROLE_EXISTS" = "no" ]; then
    # Create trust policy
    cat > /tmp/quicksight-trust.json << EOF
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
          "sts:ExternalAccount": "$ACCOUNT_ID"
        }
      }
    }
  ]
}
EOF

    # Create role
    aws iam create-role \
        --role-name QuickSightEmbeddingRole \
        --description "Role for QuickSight dashboard embedding" \
        --assume-role-policy-document file:///tmp/quicksight-trust.json

    echo "✓ Created role: QuickSightEmbeddingRole"
else
    echo "✓ Role already exists: QuickSightEmbeddingRole"
fi

# =====================================================================
# Step 2: Attach QuickSight Policy to Role
# =====================================================================
echo "Step 2: Attaching QuickSight policy..."

cat > /tmp/quicksight-policy.json << EOF
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
      "Resource": "arn:aws:quicksight:${REGION}:${ACCOUNT_ID}:dashboard/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "quicksight:GenerateEmbedUrl",
        "quicksight:GetDashboard",
        "quicksight:ListDashboards"
      ],
      "Resource": "arn:aws:quicksight:${REGION}:${ACCOUNT_ID}:analysis/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "quicksight:DescribeNamespace",
        "quicksight:DescribeUser"
      ],
      "Resource": "arn:aws:quicksight:${REGION}:${ACCOUNT_ID}:namespace/default"
    },
    {
      "Effect": "Allow",
      "Action": "quicksight:ListNamespaces",
      "Resource": "*"
    }
  ]
}
EOF

# Delete existing policy if it exists (to update it)
aws iam delete-role-policy \
    --role-name QuickSightEmbeddingRole \
    --policy-name QuickSightEmbedPolicy 2>/dev/null || true

# Create and attach policy
aws iam put-role-policy \
    --role-name QuickSightEmbeddingRole \
    --policy-name QuickSightEmbedPolicy \
    --policy-document file:///tmp/quicksight-policy.json

echo "✓ Attached QuickSight policy"

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name QuickSightEmbeddingRole --query 'Role.Arn' --output text)

echo ""
echo "=== QuickSight Role Setup Complete ==="
echo ""
echo "Role ARN: $ROLE_ARN"
echo ""
echo "NEXT STEPS (Manual):"
echo "=================="
echo "1. Sign up for QuickSight Enterprise:"
echo "   https://quicksight.aws.amazon.com/"
echo ""
echo "2. In QuickSight console:"
echo "   - Create a new analysis"
echo "   - Connect to your Athena database (turnkey_analytics)"
echo "   - Create visualizations"
echo "   - Publish dashboard"
echo ""
echo "3. Copy this environment variable to your .env.local:"
echo ""
echo "AWS_QUICKSIGHT_REGION=$REGION"
echo "AWS_QUICKSIGHT_ACCOUNT_ID=$ACCOUNT_ID"
echo "AWS_QUICKSIGHT_EMBED_ROLE_ARN=$ROLE_ARN"
echo "AWS_QUICKSIGHT_NAMESPACE=default"
echo ""
echo "4. Get your Dashboard ID from QuickSight console:"
echo "   - Go to Dashboards"
echo "   - Open your dashboard"
echo "   - Copy the Dashboard ID from the URL"
echo ""
