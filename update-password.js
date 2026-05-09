/**
 * Test script to update a user's password in AWS Cognito
 * Run: node update-password.js
 */

const { CognitoIdentityProviderClient, AdminSetUserPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";

const email = process.argv[2] || "Ryan@ryvanrecruiting.com";
const newPassword = process.argv[3] || "Ryvan#2026";

async function updatePassword() {
  console.log(`Updating password for: ${email}`);
  console.log(`New Password: ${newPassword}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: newPassword,
      Permanent: true, // Make it permanent (not temporary)
    });

    const response = await client.send(command);
    console.log("✅ Password updated successfully!");
    
    return response;
  } catch (error) {
    console.error("❌ Password update failed:", error.message);
    throw error;
  }
}

updatePassword().catch(console.error);
