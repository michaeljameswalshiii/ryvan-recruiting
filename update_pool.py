import boto3

cognito = boto3.client('cognito-idp', region_name='us-east-1')

# Update user pool to auto-verify email
cognito.update_user_pool(
    UserPoolId='us-east-1_ouSZGnQwC',
    AutoVerifiedAttributes=['email']
)

print("User pool updated - email auto-verification enabled")
