/**
 * Test script to delete a user from AWS Cognito
 * Run: node delete-user.js <user-id-or-email>
 */

const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";
const username = process.argv[2];

async function deleteUser() {
  if (!username) {
    console.error("Usage: node delete-user.js <user-id-or-email>");
    console.log("Example: node delete-user.js c47814d8-a0f1-7086-3757-ef87c86555eb");
    process.exit(1);
  }

  if (!userPoolId) {
    console.error("Error: NEXT_PUBLIC_COGNITO_USER_POOL_ID not found");
    process.exit(1);
  }

  console.log(`Deleting user: ${username}`);
  console.log(`User Pool ID: ${userPoolId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new AdminDeleteUserCommand({
      Username: username,
      UserPoolId: userPoolId,
    });

    await client.send(command);
    console.log("✅ User deleted successfully!");
    return true;
  } catch (error) {
    console.error("Error deleting user:", error.message);
    throw error;
  }
}

deleteUser().catch(console.error);
