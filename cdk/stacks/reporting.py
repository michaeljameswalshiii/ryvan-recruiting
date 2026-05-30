#!/usr/bin/env python3
"""QuickSight Reporting Stack."""
from aws_cdk import (
    Stack,
    aws_iam as iam,
    aws_quicksight as quicksight,
    aws_glue as glue,
    aws_athena as athena,
    aws_logs as aws_logs,
    Duration,
    RemovalPolicy,
    CfnOutput,
)
from constructs import Construct
import os


class ReportingStack(Stack):
    """Stack for QuickSight reporting resources."""

    def __init__(self, scope: Construct, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        account_id = os.getenv("CDK_DEFAULT_ACCOUNT", "123456789012")
        region = os.getenv("CDK_DEFAULT_REGION", "us-east-1")

        # =====================================================================
        # IAM Role for QuickSight Embedding
        # =====================================================================
        self.quicksight_embed_role = iam.Role(
            self,
            "QuickSightEmbeddingRole",
            role_name="QuickSightEmbeddingRole",
            assumed_by=iam.ServicePrincipal("quicksight.amazonaws.com"),
            description="Role for QuickSight dashboard embedding",
            max_session_duration=Duration.hours(12),
        )

        # Attach policy for QuickSight embedding
        self.quicksight_embed_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "quicksight:GenerateEmbedUrl",
                    "quicksight:GetDashboard",
                    "quicksight:ListDashboards",
                    "quicksight:ListAnalyses",
                ],
                resources=[
                    f"arn:aws:quicksight:{region}:{account_id}:dashboard/*",
                    f"arn:aws:quicksight:{region}:{account_id}:analysis/*",
                ],
            )
        )

        # =====================================================================
        # IAM Role for Glue Crawler
        # =====================================================================
        self.glue_crawler_role = iam.Role(
            self,
            "GlueCrawlerRole",
            role_name="TurnkeyGlueCrawlerRole",
            assumed_by=iam.ServicePrincipal("glue.amazonaws.com"),
            description="Role for Glue crawler to read DynamoDB",
            max_session_duration=Duration.hours(12),
        )

        # Attach policy for DynamoDB access
        self.glue_crawler_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "dynamodb:DescribeTable",
                    "dynamodb:Scan",
                ],
                resources=[
                    f"arn:aws:dynamodb:{region}:{account_id}:table/turnkey-*",
                ],
            )
        )

        # Attach policy for S3 (Glue temporary files)
        self.glue_crawler_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:ListBucket",
                ],
                resources=[
                    "arn:aws:s3:::aws-glue-*",
                    "arn:aws:s3:::aws-glue-*/*",
                ],
            )
        )

        # =====================================================================
        # Athena Workgroup
        # =====================================================================
        self.athena_workgroup = athena.CfnWorkGroup(
            self,
            "AthenaWorkgroup",
            name="turnkey-analytics",
            state="ENABLED",
            work_group_configuration=athena.CfnWorkGroup.WorkGroupConfigurationProperty(
                result_configuration=athena.CfnWorkGroup.ResultConfigurationProperty(
                    output_location=f"s3://turnkey-analytics-{account_id}/athena-results/",
                ),
                enforce_work_group_configuration=False,
            ),
        )

        # =====================================================================
        # CloudWatch Log Group for Bedrock
        # =====================================================================
        self.bedrock_log_group = aws_logs.LogGroup(
            self,
            "BedrockInvocationLogs",
            log_group_name="/aws/bedrock/modelinvocations",
            retention=aws_logs.RetentionDays.INFINITE,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # =====================================================================
        # Output role ARNs
        # =====================================================================
        CfnOutput(
            self,
            "QuickSightEmbedRoleArn",
            value=self.quicksight_embed_role.role_arn,
            description="ARN of QuickSight embedding role",
        )

        CfnOutput(
            self,
            "GlueCrawlerRoleArn",
            value=self.glue_crawler_role.role_arn,
            description="ARN of Glue crawler role",
        )

        CfnOutput(
            self,
            "AthenaWorkgroupName",
            value=self.athena_workgroup.name,
            description="Name of Athena workgroup",
        )
