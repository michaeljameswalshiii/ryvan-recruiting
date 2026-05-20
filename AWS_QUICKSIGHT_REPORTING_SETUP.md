# AWS QuickSight Reporting Setup Guide

This guide provides step-by-step instructions to set up AWS QuickSight for unified reporting across your DynamoDB data and Bedrock usage.

---

## Table of Contents

1. [AWS Glue Crawler Setup](#1-aws-glue-crawler-setup)
2. [Athena Data Source Setup](#2-athena-data-source-setup)
3. [Bedrock Logging Setup](#3-bedrock-logging-setup)
4. [QuickSight Dataset Setup](#4-quicksight-dataset-setup)
5. [Embedding Setup](#5-embedding-setup)

---

## 1. AWS Glue Crawler Setup

### Step 1.1: Create a Crawler for DynamoDB Tables

1. Go to [AWS Glue Console](https://console.aws.amazon.com/glue/)
2. In the left sidebar, click **Crawlers**
3. Click **Add crawler**
4. Configure:
   - **Crawler name**: `turnkey-dynamodb-crawler`
   - **Crawler source type**: Data stores
   - **Data store**: DynamoDB
   - **Include path**: Enter your table name (e.g., `turnkey-leads`)
5. Click **Next**
6. For **IAM role**, select **Create new IAM role**
   - Name: `turnkey-glue-crawler-role`
7. Click **Next**
8. **Run on demand** for frequency
9. Click **Next**
10. Add the crawler and finish

### Step 1.2: Repeat for Other Tables

Repeat the above for these tables:
- `turnkey-pipeline`
- `turnkey-clients`
- `turnkey-events`
- `turnkey-bedrock-usage`

### Step 1.3: Run the Crawler

1. Select your crawler
2. Click **Run crawler**
3. Wait for completion (check **Crawl history** tab)

### Step 1.4: View Created Table

1. Go to **Tables** in AWS Glue
2. You should see tables like `turnkey_leads`, `turnkey_pipeline`, etc.

---

## 2. Athena Data Source Setup

### Step 2.1: Create Database

1. Go to [Athena Console](https://console.aws.amazon.com/athena/)
2. In **Query editor**, run:
```sql
CREATE DATABASE IF NOT EXISTS turnkey_analytics;
```

### Step 2.2: Create Tables from Crawled Data

The crawler creates external tables. You can also create views for common reports:

```sql
-- Create a view for pipeline metrics
CREATE OR REPLACE VIEW pipeline_metrics AS
SELECT 
    stage,
    COUNT(*) as count,
    MIN(created_at) as earliest,
    MAX(created_at) as latest
FROM "turnkey_analytics"."turnkey_pipeline"
GROUP BY stage;

-- Create a view for AI usage summary
CREATE OR REPLACE VIEW ai_usage_summary AS
SELECT 
    user_id,
    model_id,
    COUNT(*) as invocations,
    SUM(total_tokens) as total_tokens,
    SUM(estimated_cost) as total_cost
FROM "turnkey_analytics"."turnkey_bedrock_usage"
GROUP BY user_id, model_id;
```

---

## 3. Bedrock Logging Setup

### Step 3.1: Enable CloudWatch Logging

1. Go to [AWS CloudWatch Console](https://console.aws.amazon.com/cloudwatch/
2. Go to **Logs** > **Log groups**
3. Create log group: `/aws/bedrock/modelinvocations`

### Step 3.2: Enable Logging in Bedrock

1. Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Go to **Settings** (in left sidebar)
3. Enable **CloudWatch logging**
4. Select the log group created above
5. Enable **API calls** and **Invocation logging**

### Step 3.3: Create S3 Bucket for Long-term Storage (Optional)

1. Go to [S3 Console](https://console.aws.amazon.com/s3/)
2. Create bucket: `turnkey-bedrock-logs-{account-id}`
3. Configure lifecycle rules to move to Glacier after 90 days

---

## 4. QuickSight Dataset Setup

### Step 4.1: Sign Up for QuickSight

1. Go to [QuickSight Console](https://quicksight.aws.amazon.com/
2. Sign up for Enterprise edition (required for embedding)

### Step 4.2: Create Data Source

1. In QuickSight, go to **Datasets**
2. Click **New dataset**
3. Select **Athena**
4. Configure:
   - **Data source name**: `turnkey-athena`
   - **Athena workgroup**: `primary`
5. Select the database: `turnkey_analytics`
6. Select tables/views to import

### Step 4.3: Create Datasets

Create these datasets:
- `turnkey-leads-dataset` (from `turnkey_leads` table)
- `turnkey-pipeline-dataset` (from `turnkey_pipeline` table)
- `turnkey-usage-dataset` (from `turnkey_bedrock_usage` table)

### Step 4.4: Create Analysis

1. Go to **Analyses**
2. Click **New analysis**
3. Select a dataset
4. Create visualizations:
   - Pipeline Funnel (by stage)
   - Conversion Rates
   - AI Usage by Model
   - Cost Over Time

---

## 5. Embedding Setup

### Step 5.1: Create IAM Policy for Embedding

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Create policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "quicksight:GenerateEmbedUrl",
        "quicksight:GetDashboard",
        "quicksight:ListDashboards"
      ],
      "Resource": "arn:aws:quicksight:*:{account-id}:dashboard/*"
    }
  ]
}
```

### Step 5.2: Get QuickSight ARN

1. In QuickSight, go to **Dashboards**
2. Open your dashboard
3. Click **Share** > **Embed dashboard**
4. Copy the **Dashboard ARN** (format: `arn:aws:quicksight:region:account-id:dashboard/dashboard-id`)

### Step 5.3: Add Environment Variables

Add to your `.env.local`:
```
AWS_QUICKSIGHT_REGION=us-east-1
AWS_QUICKSIGHT_ACCOUNT_ID=your-account-id
AWS_QUICKSIGHT_EMBED_ROLE_ARN=arn:aws:iam::your-account-id:role/QuickSightEmbeddingRole
AWS_QUICKSIGHT_NAMESPACE=default
```

### Step 5.4: Create Embed URL (Server-Side)

Use the API route we'll create: `POST /api/reporting/embed-url`

Request:
```json
{
  "dashboardId": "your-dashboard-id",
  "tenantId": "tenant-123"
}
```

Response:
```json
{
  "embedUrl": "https://...",
  "expiration": "2024-01-01T00:00:00Z"
}
```

---

## Security: Row-Level Filtering

### Option 1: Use QuickSight's Built-in Row-Level Security

1. Create a security dataset with tenant mappings
2. Associate with your main dataset
3. Configure permissions by tenant

### Option 2: Use Embed URL Filters

Pass filters in the embed URL generation:

```typescript
const embedUrl = await generateEmbedUrl({
  dashboardId: 'dashboard-id',
  filters: [
    {
      column: 'tenant_id',
      values: ['tenant-123'],
      operator: 'EQUALS'
    }
  ]
});
```

---

## Troubleshooting

### Common Issues

**Issue**: Crawler fails to read DynamoDB
- **Fix**: Ensure IAM role has `dynamodb:DescribeTable` permissions

**Issue**: Athena query timeout
- **Fix**: Increase workgroup timeout or use smaller tables

**Issue**: Embed URL expires too quickly
- **Fix**: Regenerate URL on client side or increase expiration (max 12 hours)

**Issue**: QuickSight not available in region
- **Fix**: Ensure QuickSight is enabled in that region

---

## Next Steps

After completing these steps:

1. Deploy the code from `/src/lib/aws/reporting.ts`
2. Access `/dashboard/reporting` in your app
3. The page will show QuickSight dashboards with fallback charts

---

## Cost Estimates

- **Athena**: $5 per TB scanned
- **Glue**: $0.44 per DPU-hour
- **QuickSight Enterprise**: $18/user/month
- **CloudWatch Logs**: ~$0.50/GB/month

For a typical small deployment: **$50-100/month**
