/**
 * Check profile for user in DynamoDB
 */

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });

// User sub for michaeljameswalshiii@gmail.com
const userId = "34689498-40a1-70e2-e604-aeb2af721269";

async function checkProfile() {
  console.log(`=== Checking profile for user: ${userId} ===\n`);
  
  try {
    const result = await client.send(new GetItemCommand({
      TableName: "turnkey-profiles",
      Key: marshall({ id: userId }),
    }));
    
    if (result.Item) {
      const profile = unmarshall(result.Item);
      console.log('✅ Profile found:');
      console.log(JSON.stringify(profile, null, 2));
    } else {
      console.log('❌ No profile found - need to create one');
    }
    
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
}

checkProfile().catch(console.error);
