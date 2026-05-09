/**
 * Test script to enable USER_PASSWORD_AUTH flow in Cognito App Client
 * Run: node enable-auth-flow.js
 */

const { CognitoIdentityProviderClient, UpdateUserPoolClientCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";
const clientId = "2pmq97apq4sehfdcb7ri05007f";

async function enableAuthFlow() {
  console.log("Enabling USER_PASSWORD_AUTH flow...");
  console.log(`User Pool ID: ${userPoolId}`);
  console.log(`Client ID: ${clientId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new UpdateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      // Enable USER_PASSWORD_AUTH
      AllowedAuthFlows: [
        "USER_PASSWORD_AUTH",
        "USER_SRP_AUTH",
      ],
    });

    const response = await client.send(command);
    console.log("✅ Auth flow enabled!");
    console.log("  Now users can sign in with email and password.");
    
    return response;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

enableAuthFlow().catch(console.error);
