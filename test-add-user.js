/**
 * Test script to add a new user to AWS Cognito
 * Run: node test-add-user.js <email> [password]
 * 
 * Default password: TempPass123!
 */

const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminAddUserToGroupCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";

const email = process.argv[2] || "waving1@gmail.com";
const password = process.argv[3] || "TempPass123!";
const fullName = process.argv[4] || "New User";

async function addUser() {
  console.log(`Adding user: ${email}`);
  console.log(`Region: ${region}`);
  console.log(`User Pool ID: ${userPoolId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    // First, create the user with adminCreateUser (sets temp password)
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      TemporaryPassword: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "name", Value: fullName },
        { Name: "email_verified", Value: "true" },
      ],
      DesiredDeliveryMediums: ["EMAIL"],
      MessageAction: "SUPPRESS", // Don't send email - we'll set password manually
    });

    const createResponse = await client.send(createCommand);
    console.log("✅ User created in Cognito!");
    console.log(`  User ID: ${createResponse.User.Username}`);
    console.log(`  Status: ${createResponse.User.UserStatus}`);
    console.log("  Note: User will need to reset password on first login");
    
    return createResponse;
  } catch (error) {
    console.error("❌ Failed to create user:", error.message);
    if (error.name === "UsernameExistsException") {
      console.log("   User already exists in Cognito");
    }
    throw error;
  }
}

addUser().catch(console.error);
