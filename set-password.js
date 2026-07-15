/**
 * Set password_hash on a profile (local ops only).
 *
 * Usage:
 *   node set-password.js <email> <new-password>
 *
 * Requires AWS credentials in the environment.
 * Never hard-code passwords in this file or commit them.
 */

const {
  DynamoDBClient,
  UpdateItemCommand,
  ScanCommand,
} = require("@aws-sdk/client-dynamodb");
const { hashSync, genSaltSync } = require("bcryptjs");

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: node set-password.js <email> <new-password>");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }

  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  console.log("Setting password for:", email);

  const profilesTable =
    process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";

  const scanResult = await client.send(
    new ScanCommand({
      TableName: profilesTable,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": { S: email },
      },
    })
  );

  if (!scanResult.Items || scanResult.Items.length === 0) {
    console.log("No profile found for:", email);
    return;
  }

  const profile = scanResult.Items[0];
  const profileId = profile.id.S;

  await client.send(
    new UpdateItemCommand({
      TableName: profilesTable,
      Key: { id: { S: profileId } },
      UpdateExpression: "SET password_hash = :h",
      ExpressionAttributeValues: {
        ":h": { S: hash },
      },
    })
  );

  console.log("Password updated for profile:", profileId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
