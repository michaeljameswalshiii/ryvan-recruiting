/**
 * Reset password for a user in AWS Cognito
 * Run: node reset-password.js <username> <new-password>
 */

const { CognitoIdentityProviderClient, AdminSetUserPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";
const username = process.argv[2];
const newPassword = process.argv[3];

async function resetPassword() {
  if (!username || !newPassword) {
    console.error("Usage: node reset-password.js <username> <new-password>");
    console.log("Example: node reset-password.js b498a438-8041-7016-f5ee-c4eb3aa4dab5 Turnkey2026!");
    process.exit(1);
  }

  console.log(`Resetting password for user: ${username}`);
  console.log(`User Pool ID: ${userPoolId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new AdminSetUserPasswordCommand({
      Username: username,
      UserPoolId: userPoolId,
      Password: newPassword,
      Permanent: true, // Makes the password permanent (not temporary)
    });

    await client.send(command);
    console.log("✅ Password reset successfully!");
    console.log(`New password set for user ${username}`);
    return true;
  } catch (error) {
    console.error("Error resetting password:", error.message);
    throw error;
  }
}

resetPassword().catch(console.error);
