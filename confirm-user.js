/**
 * Test script to force confirm a user in AWS Cognito
 * Run: node confirm-user.js
 */

const { CognitoIdentityProviderClient, AdminConfirmSignUpCommand, AdminGetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";

const email = process.argv[2] || "Ryan@ryvanrecruiting.com";

async function confirmUser() {
  console.log(`Confirming user: ${email}`);
  console.log(`User Pool ID: ${userPoolId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    // First, check current user status
    const getCommand = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: email,
    });
    
    const userInfo = await client.send(getCommand);
    console.log("Current status:", userInfo.UserStatus);
    console.log("Enabled:", userInfo.Enabled);
    console.log("---");

    // Now confirm the user
    const command = new AdminConfirmSignUpCommand({
      UserPoolId: userPoolId,
      Username: email,
    });

    await client.send(command);
    console.log("✅ User confirmed successfully!");
    
  } catch (error) {
    console.error("❌ Confirm failed:", error.message);
    throw error;
  }
}

confirmUser().catch(console.error);
