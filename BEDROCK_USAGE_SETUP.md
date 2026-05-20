# Bedrock Model Invocation Logging Setup

This document explains how to enable and configure Model Invocation Logging for AWS Bedrock to track AI usage, tokens, and costs.

## Step 1: Enable Model Invocation Logging (AWS Console)

### 1.1 Navigate to Bedrock Console
1. Log into AWS Console: https://console.aws.amazon.com/bedrock/
2. Go to **Bedrock** > **Model invocation logging** (left sidebar)

### 1.2 Enable Logging
1. Click **Enable logging** button
2. Configure the following settings:

| Setting | Value | Notes |
|---------|-------|-------|
| Logging level | All (Full request/response) | Captures input/output tokens |
| Log destination | CloudWatch Logs + S3 | Both for redundancy |
| CloudWatch Logs | Create new or select existing | Log group: `/aws/bedrock/model-invocation` |
| S3 bucket | Create new: `your-bucket-bedrock-logs` | Enable server-side encryption |

### 1.3 Select Models to Log
- Enable logging for all Claude models:
  - `us.anthropic.claude-haiku-4-2025-01-15`
  - `global.anthropic.claude-sonnet-4-6`
  - `us.anthropic.claude-opus-4-7-2025-01-15`

### 1.4 Create S3 Bucket (if needed)
```bash
aws s3 mb s3://your-company-bedrock-logs --region us-east-1
aws s3api put-bucket-encryption \
  --bucket your-company-bedrock-logs \
  --server-side-encryption-configuration '{"ServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}'
```

## Step 2: Athena Setup for Querying Logs

### 2.1 Create Database
```sql
CREATE DATABASE IF NOT EXISTS bedrock_logs;
```

### 2.2 Create Table (run in Athena Query Editor)
```sql
CREATE EXTERNAL TABLE IF NOT EXISTS bedrock_logs.model_invocation_logs (
  request_id STRING,
  timestamp STRING,
  model_id STRING,
  model_arn STRING,
  input_token_count INT,
  output_token_count INT,
  invocation_seed INT,
  turn_id INT,
  session_id STRING,
  request_body STRUCT<
    messages: ARRAY<STRUCT<role:STRING,content:STRING>>,
    system: ARRAY<STRUCT<content:STRING>>,
    max_tokens: INT,
    temperature: DOUBLE,
    top_p: DOUBLE
  >,
  response_body STRUCT<
    id: STRING,
    type: STRING,
    role: STRING,
    content: ARRAY<STRUCT<type:STRING,text:STRING>>,
    usage: STRUCT<input_tokens:INT,output_tokens:INT>,
    stop_reason: STRING
  >,
  runtime STRING,
  cached BOOL,
  x_amz_invocation_type: STRING,
  x_amz_request_id STRING,
  x_amz_debug_id STRING,
  user_agent STRING,
  remote_ip STRING
)
PARTITIONED BY (dt STRING)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe'
LOCATION 's3://your-company-bedrock-logs/bedrock/'
TBLPROPERTIES ('has_encrypted_data'='true');
```

### 2.3 Add Partition (run daily or on load)
```sql
ALTER TABLE bedrock_logs.model_invocation_logs 
ADD PARTITION (dt='2025-01-15')
LOCATION 's3://your-company-bedrock-logs/bedrock/dt=2025-01-15/';
```

## Step 3: QuickSight Setup (Optional)

### 3.1 Create Analysis
1. Go to QuickSight: https://quicksight.aws.amazon.com/
2. Create new Analysis
3. Connect to Athena data source (bedrock_logs)

### 3.2 Recommended Visualizations
- **Total Cost Over Time** (Line chart)
- **Tokens by Model** (Pie chart)  
- **Usage by Tenant/User** (Bar chart)
- **Top Queries** (Table)
- **Daily Invocation Count** (KPI)

## Step 4: Verify Logging is Working

### 4.1 Make a Test Request
Call the Bedrock API from your app.

### 4.2 Check CloudWatch
1. Go to CloudWatch > Log groups
2. Find `/aws/bedrock/model-invocation`
3. Check for new log streams

### 4.3 Check S3
1. Go to S3 > your bucket
2. Look for `bedrock/dt=YYYY-MM-DD/` prefix

## Cost Calculation Reference

Current Claude pricing on Bedrock (us-east-1):

| Model | Input (per 1K tokens) | Output (per 1K tokens) |
|-------|---------------------|----------------------|
| Haiku 4.5 | $0.00025 | $0.00125 |
| Sonnet 4.6 | $0.003 | $0.015 |
| Opus 4.7 | $0.015 | $0.075 |

Global models (cross-region) may vary slightly.

## Troubleshooting

### Logs Not Appearing
1. Check IAM permissions: Ensure Bedrock can write to CloudWatch/S3
2. Verify model is enabled for logging
3. Wait 5-10 minutes for logs to propagate

### Athena Query Returns No Data
1. Run `MSCK REPAIR TABLE` to refresh partitions
2. Check S3 bucket path matches table location

### QuickSight Can't Connect
1. Ensure Athena data source is created in QuickSight
2. Check IAM permissions for QuickSight access to S3
