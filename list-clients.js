/**
 * List Cognito User Pool App Clients
 * Run: node list-clients.js
 */

const { CognitoIdentityProviderClient, ListUserPoolClientsCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = "us-east-1";
const userPoolId = "us-east-1_ouSZGnQwC";

async function listClients() {
  console.log(`Listing app clients for user pool: ${userPoolId}`);
  console.log("---");

  const client = new CognitoIdentityProviderClient({ region });

  try {
    const command = new ListUserPoolClientsCommand({
      UserPoolId: userPoolId,
      MaxResults: 10
    });

    const response = await client.send(command);
    
    if (response.UserPoolClients && response.UserPoolClients.length > 0) {
      console.log(`Found ${response.UserPoolClients.length} app client(s):\n`);
      response.UserPoolClients.forEach(appClient => {
        console.log(`  Client Name: ${appClient.ClientName}`);
        console.log(`  Client ID: ${appClient.ClientId}`);
        console.log("");
      });
    } else {
      console.log("No app clients found. You need to create one!");
    }
    
    return response.UserPoolClients;
  } catch (error) {
    console.error("Error listing clients:", error.message);
    throw error;
  }
}

listClients().catch(console.error);
