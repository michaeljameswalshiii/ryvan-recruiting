/**
 * Test script to check Cognito User Pool configuration
 * Run: node check-pool.js
 */

const { CognitoIdentityProviderClient, DescribeUserPoolCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";

async function checkPool() {
  console.log("Checking User Pool configuration...");
  console.log(`User Pool ID: ${userPoolId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new DescribeUserPoolCommand({
      UserPoolId: userPoolId,
    });

    const response = await client.send(command);
    const pool = response.UserPool;
    
    console.log("✅ User Pool Found!");
    console.log(`  Pool Name: ${pool.Name}`);
    console.log(`  Status: ${pool.Status}`);
    console.log(`  Created: ${pool.CreationDate}`);
    console.log("");
    console.log("  Schema Attributes:");
    if (pool.SchemaAttributes) {
      pool.SchemaAttributes.forEach(attr => {
        console.log(`    - ${attr.Name}: ${attr.Required ? "required" : "optional"}`);
      });
    }
    console.log("");
    console.log("  Alias Attributes (how users can sign in):");
    if (pool.AliasAttributes) {
      pool.AliasAttributes.forEach(alias => {
        console.log(`    - ${alias}`);
      });
    } else {
      console.log("    (none - users must sign in with username)");
    }
    console.log("");
    console.log("  Auto Verified Attributes:");
    if (pool.AutoVerifiedAttributes) {
      pool.AutoVerifiedAttributes.forEach(attr => {
        console.log(`    - ${attr.AttributeName}`);
      });
    }
    console.log("");
    console.log("  Mfa Configuration:");
    console.log(`    - ${pool.MfaConfiguration}`);
    
    return pool;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

checkPool().catch(console.error);
