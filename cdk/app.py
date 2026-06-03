#!/usr/bin/env python3
"""TurnkeyOptimization CDK App."""
import os
from aws_cdk import App, Environment
from stacks.auth import AuthStack
from stacks.dynamodb import DataStack
from stacks.reporting import ReportingStack
from stacks.s3 import StorageStack

# Create CDK App
app = App()

# Get account/region from environment or use defaults
account = os.getenv("CDK_DEFAULT_ACCOUNT", "123456789012")
region = os.getenv("CDK_DEFAULT_REGION", "us-east-1")
env = Environment(account=account, region=region)

# Deploy Auth Stack (Cognito)
auth_stack = AuthStack(app, "TurnkeyAuth", env=env)

# Deploy Data Stack (DynamoDB)
data_stack = DataStack(app, "TurnkeyData", env=env)

# Deploy Storage Stack (S3)
storage_stack = StorageStack(app, "TurnkeyStorage", env=env)

# Deploy Reporting Stack (QuickSight, Athena, Glue)
reporting_stack = ReportingStack(app, "TurnkeyReporting", env=env)

# Synthesize
app.synth()
