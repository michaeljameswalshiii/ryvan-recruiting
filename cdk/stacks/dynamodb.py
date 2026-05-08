from aws_cdk import Stack, aws_dynamodb as dynamodb
from constructs import Construct


class DataStack(Stack):
    """DynamoDB tables for TurnkeyOptimization multi-tenant data."""

    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # Tenants table
        self.tenants_table = dynamodb.Table(
            self,
            "Tenants",
            table_name="turnkey-tenants",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )

        # Profiles table
        self.profiles_table = dynamodb.Table(
            self,
            "Profiles",
            table_name="turnkey-profiles",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )
        self.profiles_table.add_global_secondary_index(
            index_name="tenant-index",
            partition_key=dynamodb.Attribute(
                name="tenant_id",
                type=dynamodb.AttributeType.STRING,
            ),
        )

        # Clients table
        self.clients_table = dynamodb.Table(
            self,
            "Clients",
            table_name="turnkey-clients",
            partition_key=dynamodb.Attribute(
                name="tenant_id",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )
        self.clients_table.add_global_secondary_index(
            index_name="email-index",
            partition_key=dynamodb.Attribute(
                name="email",
                type=dynamodb.AttributeType.STRING,
            ),
        )

        # Outreach leads table
        self.leads_table = dynamodb.Table(
            self,
            "Leads",
            table_name="turnkey-leads",
            partition_key=dynamodb.Attribute(
                name="tenant_id",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )

        # Data sources table
        self.sources_table = dynamodb.Table(
            self,
            "Sources",
            table_name="turnkey-sources",
            partition_key=dynamodb.Attribute(
                name="tenant_id",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )
