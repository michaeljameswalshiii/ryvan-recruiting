/**
 * List all users in Cognito user pool
 */

const { CognitoIdentityProviderClient, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";

async function listUsers() {
  console.log(`Listing users in pool: ${userPoolId}`);
  console.log('');

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new ListUsersCommand({
      UserPoolId: userPoolId,
      MaxResults: 50,
    });

    const response = await client.send(command);
    
    if (!response.Users || response.Users.length === 0) {
      console.log('No users found');
      return;
    }

    console.log(`Found ${response.Users.length} user(s):`);
    console.log('');

    for (const user of response.Users) {
      console.log(`- ${user.Username}`);
      console.log(`  Status: ${user.UserStatus}`);
      console.log(`  Enabled: ${user.Enabled}`);
      
      if (user.UserAttributes) {
        const emailAttr = user.UserAttributes.find(a => a.Name === 'email');
        const subAttr = user.UserAttributes.find(a => a.Name === 'sub');
        const nameAttr = user.UserAttributes.find(a => a.Name === 'name');
        
        console.log(`  Email: ${emailAttr?.Value || '(none)'}`);
        console.log(`  Sub: ${subAttr?.Value || '(none)'}`);
        console.log(`  Name: ${nameAttr?.Value || '(none)'}`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listUsers().catch(console.error);
