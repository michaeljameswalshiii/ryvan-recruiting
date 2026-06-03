#!/usr/bin/env python3
"""S3 Storage Stack for TurnkeyOptimization."""
from aws_cdk import Stack, CfnOutput, aws_s3 as s3, RemovalPolicy
from constructs import Construct


class StorageStack(Stack):
    """S3 bucket for resume uploads and other storage."""

    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # S3 bucket for resume uploads
        self.resumes_bucket = s3.Bucket(
            self,
            "ResumesBucket",
            bucket_name=f"turnkey-resumes-{self.account}",
            removal_policy=RemovalPolicy.RETAIN,
            block_public_access=s3.BlockPublicAccess(
                block_public_acls=True,
                block_public_policy=True,
                ignore_public_acls=True,
                restrict_public_buckets=True,
            ),
        )

        # Add CORS for browser-based uploads
        self.resumes_bucket.add_cors_rule(
            s3.CorsRule(
                allowed_methods=[s3.HttpMethods.POST, s3.HttpMethods.PUT],
                allowed_origins=["*"],
                allowed_headers=["*"],
            )
        )

        # Output bucket name
        CfnOutput(
            self,
            "ResumesBucketName",
            value=self.resumes_bucket.bucket_name,
            export_name="TurnkeyResumesBucketName",
        )
