/**
 * Test script to create a user in AWS Cognito
 * Run: node test-signup.js
 */

const { CognitoIdentityProviderClient, SignUpCommand, AdminConfirmSignUpCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";
const clientId = "2pmq97apq4sehfdcb7ri05007f";

const email = process.argv[2] || "test@example.com";
const password = process.argv[3] || "Test123!";
const name = process.argv[4] || "Test User";

async function testSignup() {
  console.log(`Creating user: ${email}`);
  console.log(`Region: ${region}`);
  console.log(`User Pool ID: ${userPoolId}`);
  console.log(`Client ID: ${clientId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    // Sign up the user
    const signUpCommand = new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "name", Value: name },
      ],
    });

    const signUpResult = await client.send(signUpCommand);
    console.log("✅ User signed up successfully!");
    console.log(`  User Sub: ${signUpResult.UserSub}`);
    console.log("");

    // Try to confirm the user (admin auto-confirm)
    try {
      const confirmCommand = new AdminConfirmSignUpCommand({
        UserPoolId: userPoolId,
        Username: email,
      });
      await client.send(confirmCommand);
      console.log("✅ User confirmed!");
    } catch (confirmError) {
      console.log("ℹ️ Could not auto-confirm:", confirmError.message);
      console.log("   User will need to confirm via email.");
    }

    return signUpResult;
  } catch (error) {
    console.error("❌ Signup failed:", error.message);
    if (error.name === "UsernameExistsException") {
      console.log("   User already exists!");
    }
    throw error;
  }
}

testSignup().catch(console.error);
