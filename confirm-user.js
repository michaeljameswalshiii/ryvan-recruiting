/**
 * Confirm user in Cognito
 */

const { CognitoIdentityProviderClient, AdminConfirmSignUpCommand } = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({ region: "us-east-1" });
const userPoolId = "us-east-1_ouSZGnQwC";

// User sub from michaeljameswalshiii@gmail.com
const username = "34689498-40a1-70e2-e604-aeb2af721269";

async function confirmUser() {
  console.log(`=== Confirming user: ${username} ===\n`);
  
  try {
    const result = await client.send(new AdminConfirmSignUpCommand({
      Username: username,
      UserPoolId: userPoolId,
    }));
    
    console.log('✅ User confirmed successfully!');
    console.log('Response:', result);
    
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
}

confirmUser().catch(console.error);
