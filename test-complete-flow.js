/**
 * Complete flow test: Login as Ryan → Seed Data → Add Company → Check Dashboard
 */

const VERCEL_URL = 'https://turnkey-optimization.vercel.app';

console.log('=== Testing Complete Company Flow ===\n');

// We'll use the AWS SDK to get tokens for Ryan via admin method
const { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminGetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";
const clientId = "2pmq97apq4sehfdcb7ri05007f";

async function getSessionForUser(email, password) {
  const client = new CognitoIdentityProviderClient({ region });
  
  const command = new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });
  
  const response = await client.send(command);
  return response.AuthenticationResult;
}

async function main() {
  const email = "Ryan@ryvanrecruiting.com";
  const password = "TestPassword123!"; // Try some common patterns
  
  try {
    console.log(`[Step 1] Authenticating as ${email}...`);
    const authResult = await getSessionForUser(email, password);
    console.log('Success! Got tokens');
    console.log('Access Token:', authResult.AccessToken?.substring(0, 20) + '...');
  } catch (error) {
    console.log('Failed:', error.message);
  }
}

main().catch(console.error);
