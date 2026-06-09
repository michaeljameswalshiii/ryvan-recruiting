/**
 * Test: Confirm user in Cognito and set password
 */

const { CognitoIdentityProviderClient, AdminSetUserPasswordCommand, AdminEnableUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

const client = new CognitoIdentityProviderClient({ region: 'us-east-1' });
const USER_POOL_ID = 'us-east-1_ouSZGnQwC';

// User from earlier - can just use the email to look up
const USERNAME = '54f87418-c021-70c1-0393-c8c47cd21cc3'; // waving1@gmail.com's sub
const PASSWORD = 'Nassau#94';

async function confirmUser() {
  console.log(`Confirming user: ${USERNAME}`);
  console.log(`Setting password: ${PASSWORD}`);
  
  // First enable the user
  try {
    await client.send(new AdminEnableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: USERNAME,
    }));
    console.log('✅ User enabled');
  } catch (err) {
    if (err.name === 'InvalidParameterException' || err.message?.includes('already')) {
      console.log('ℹ️ User already enabled');
    } else {
      throw err;
    }
  }
  
  // Then set the password (permanent so they don't need to change it)
  const result = await client.send(new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID,
    Username: USERNAME,
    Password: PASSWORD,
    Permanent: true,
  }));
  
  console.log('✅ Password set!');
  console.log(result);
}

confirmUser().catch(console.error);
