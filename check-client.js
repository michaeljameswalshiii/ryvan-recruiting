/**
 * Test script to check Cognito App Client configuration
 * Run: node check-client.js
 */

const { CognitoIdentityProviderClient, DescribeUserPoolClientCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";
const clientId = "2pmq97apq4sehfdcb7ri05007f";

async function checkClient() {
  console.log("Checking App Client configuration...");
  console.log(`User Pool ID: ${userPoolId}`);
  console.log(`Client ID: ${clientId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new DescribeUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
    });

    const response = await client.send(command);
    const appClient = response.UserPoolClient;
    
    console.log("✅ App Client Found!");
    console.log(`  Client Name: ${appClient.ClientName}`);
    console.log(`  Client ID: ${appClient.ClientId}`);
    console.log("");
    console.log("  OAuth Settings:");
    if (appClient.OAuthSettings) {
      console.log(`    Callback URLs: ${appClient.OAuthSettings.CallbackURLs?.join(", ")}`);
      console.log(`    Logout URLs: ${appClient.OAuthSettings.LogoutURLs?.join(", ")}`);
      console.log(`    Allowed OAuth Flows: ${appClient.OAuthSettings.AllowedOAuthFlows?.join(", ")}`);
      console.log(`    Allowed OAuth Scopes: ${appClient.OAuthSettings.AllowedOAuthScopes?.join(", ")}`);
    }
    console.log("");
    console.log("  Auth Flows:");
    if (appClient.AllowedAuthFlows) {
      appClient.AllowedAuthFlows.forEach(flow => {
        console.log(`    - ${flow}`);
      });
    }
    console.log("");
    console.log("  Enable Token Endpoint:");
    console.log(`    - ${appClient.EnableTokenEndpoint}`);
    console.log("");
    console.log("  Prevent User Existence Errors:");
    console.log(`    - ${appClient.PreventUserExistenceErrors}`);
    
    return appClient;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

checkClient().catch(console.error);
