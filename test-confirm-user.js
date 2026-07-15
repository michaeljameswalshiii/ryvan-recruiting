/**
 * Confirm a Cognito user and set password (ops script).
 *
 * Usage:
 *   COGNITO_USER_POOL_ID=... COGNITO_USERNAME=... NEW_PASSWORD=... node test-confirm-user.js
 */

const {
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand,
  AdminEnableUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const USERNAME = process.env.COGNITO_USERNAME;
const PASSWORD = process.env.NEW_PASSWORD;
const region = process.env.AWS_REGION || "us-east-1";

if (!USER_POOL_ID || !USERNAME || !PASSWORD) {
  console.error(
    "Set COGNITO_USER_POOL_ID, COGNITO_USERNAME, and NEW_PASSWORD"
  );
  process.exit(1);
}

async function main() {
  const client = new CognitoIdentityProviderClient({ region });

  await client.send(
    new AdminEnableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: USERNAME,
    })
  );

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: USERNAME,
      Password: PASSWORD,
      Permanent: true,
    })
  );

  console.log("Password set for user:", USERNAME);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
