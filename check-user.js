/**
 * Test script to check if a user exists in AWS Cognito
 * Run: node check-user.js
 */

const { CognitoIdentityProviderClient, AdminGetUserCommand, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");

// Hardcoded for TurnkeyOptimization
const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";
const email = process.argv[2] || "Ryan@ryvanrecruiting.com";

async function checkUser() {
  if (!userPoolId) {
    console.error("Error: NEXT_PUBLIC_COGNITO_USER_POOL_ID not found in environment variables");
    console.log("Make sure to run: npx dotenv-flow local");
    process.exit(1);
  }

  console.log(`Checking for user: ${email}`);
  console.log(`Region: ${region}`);
  console.log(`User Pool ID: ${userPoolId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    // Try to get the user directly
    const command = new AdminGetUserCommand({
      Username: email,
      UserPoolId: userPoolId,
    });

    const response = await client.send(command);
    console.log("✅ User found!");
    console.log("User details:");
    console.log(`  Username: ${response.Username}`);
    console.log(`  Status: ${response.UserStatus}`);
    console.log(`  Enabled: ${response.Enabled}`);
    console.log(`  Created: ${response.UserCreateDate}`);
    console.log(`  Last Modified: ${response.UserLastModifiedDate}`);
    
    if (response.UserAttributes) {
      console.log("  Attributes:");
      response.UserAttributes.forEach(attr => {
        console.log(`    ${attr.Name}: ${attr.Value}`);
      });
    }
    
    return response;
  } catch (error) {
    if (error.name === "UserNotFoundException") {
      console.log("❌ User not found in Cognito");
      console.log("This means the user was never created, or was deleted.");
      
      // Try listing users to see what users exist
      console.log("\n---");
      console.log("Listing users in user pool...");
      
      try {
        const listCommand = new ListUsersCommand({
          UserPoolId: userPoolId,
          MaxResults: 10
        });
        const listResponse = await client.send(listCommand);
        
        if (listResponse.Users && listResponse.Users.length > 0) {
          console.log(`Found ${listResponse.Users.length} user(s):`);
          listResponse.Users.forEach(user => {
            console.log(`  - ${user.Username} (${user.UserStatus})`);
          });
        } else {
          console.log("No users found in this user pool.");
        }
      } catch (listError) {
        console.log("Could not list users:", listError.message);
      }
      
      return null;
    } else {
      console.error("Error checking user:", error.message);
      throw error;
    }
  }
}

checkUser().catch(console.error);
