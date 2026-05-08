from aws_cdk import Stack, CfnOutput, aws_cognito as cognito
from constructs import Construct


class AuthStack(Stack):
    """Cognito User Pool for TurnkeyOptimization authentication."""

    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # Create Cognito User Pool
        self.user_pool = cognito.UserPool(
            self,
            "TurnkeyUserPool",
            user_pool_name="turnkey-optimization-pool",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(
                email=True,
            ),
            auto_verify=cognito.AutoVerifiedAttrs(
                email=True,
            ),
standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(
                    required=True,
                    mutable=False,
                ),
                fullname=cognito.StandardAttribute(
                    required=False,
                    mutable=True,
                ),
            ),
        )

        # Create User Pool Client for Next.js app
        self.user_pool_client = cognito.UserPoolClient(
            self,
            "TurnkeyWebClient",
            user_pool=self.user_pool,
            auth_flows=cognito.AuthFlow(
                user_password=True,
                user_srp=True,
            ),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(
                    authorization_code_grant=True,
                ),
                scopes=[
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
            ),
        )

        # Output User Pool ID
        CfnOutput(
            self,
            "UserPoolId",
            value=self.user_pool.user_pool_id,
            export_name="TurnkeyUserPoolId",
        )
        CfnOutput(
            self,
            "UserPoolClientId",
            value=self.user_pool_client.user_pool_client_id,
            export_name="TurnkeyUserPoolClientId",
        )
