/**
 * Get user details from Cognito
 */

const { CognitoIdentityProviderClient, AdminGetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({ region: "us-east-1" });
const userPoolId = "us-east-1_ouSZGnQwC";

const users = [
  "b498a438-8041-7016-f5ee-c4eb3aa4dab5",
  "3408e448-c061-7088-96a5-8977c232277b", 
  "94e87478-e0e1-7003-c565-32b4a621e259",
  "34689498-40a1-70e2-e604-aeb2af721269",
  "54f83438-e061-704d-ffc1-6f7a0f5f5346",
];

async function checkUsers() {
  console.log('=== Checking User Emails ===\n');
  
  for (const userSub of users) {
    try {
      const result = await client.send(new AdminGetUserCommand({
        Username: userSub,
        UserPoolId: userPoolId,
      }));
      
      const email = result.UserAttributes?.find(a => a.Name === 'email')?.Value;
      const name = result.UserAttributes?.find(a => a.Name === 'name')?.Value;
      const status = result.UserStatus;
      const enabled = result.Enabled;
      
      console.log(`User: ${userSub}`);
      console.log(`  Email: ${email || 'N/A'}`);
      console.log(`  Name: ${name || 'N/A'}`);
      console.log(`  Status: ${status}`);
      console.log(`  Enabled: ${enabled}`);
      console.log('');
    } catch (e) {
      console.log(`Error for ${userSub}: ${e.message}`);
    }
  }
}

checkUsers().catch(console.error);
