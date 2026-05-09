/**
 * Test script to sign in a user in AWS Cognito
 * Run: node test-login.js
 */

const { CognitoIdentityProviderClient, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const clientId = "2pmq97apq4sehfdcb7ri05007f";

const email = process.argv[2] || "Ryan@ryvanrecruiting.com";
const password = process.argv[3] || "Test123!";

async function testLogin() {
  console.log(`Signing in user: ${email}`);
  console.log(`Region: ${region}`);
  console.log(`Client ID: ${clientId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await client.send(command);
    
    if (response.AuthenticationResult) {
      console.log("✅ Login successful!");
      console.log(`  Access Token: ${response.AuthenticationResult.AccessToken?.substring(0, 20)}...`);
      console.log(`  Expires In: ${response.AuthenticationResult.ExpiresIn}s`);
      console.log(`  Id Token: ${response.AuthenticationResult.IdToken ? "present" : "not present"}`);
    } else {
      console.log("ℹ️ Challenge required:", response.ChallengeName);
      console.log("   Session:", response.Session?.substring(0, 20) + "...");
    }
    
    return response;
  } catch (error) {
    console.error("❌ Login failed:", error.message);
    if (error.name === "UserNotFoundException") {
      console.log("   User does not exist in Cognito");
    } else if (error.name === "NotAuthorizedException") {
      console.log("   Incorrect password or user not allowed");
    } else if (error.name === "InvalidParameterException") {
      console.log("   Missing required parameters");
    }
    throw error;
  }
}

testLogin().catch(console.error);
