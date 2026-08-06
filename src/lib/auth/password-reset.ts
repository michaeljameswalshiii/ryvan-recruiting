import crypto from 'crypto';
import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
const tableName = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';

function client() {
  return new DynamoDBClient({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined,
  });
}

export function normalizeResetEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function findProfileByEmail(email: string) {
  const result = await client().send(new ScanCommand({
    TableName: tableName,
    ProjectionExpression: 'id,email,#s',
    ExpressionAttributeNames: { '#s': 'status' },
  }));
  return (result.Items || []).find((item) => item.email?.S?.trim().toLowerCase() === normalizeResetEmail(email)) || null;
}

export async function createPasswordReset(email: string) {
  const profile = await findProfileByEmail(email);
  if (!profile?.id?.S) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = String(Date.now() + 30 * 60 * 1000);
  await client().send(new UpdateItemCommand({
    TableName: tableName,
    Key: { id: { S: profile.id.S } },
    UpdateExpression: 'SET reset_token_hash = :h, reset_expires_at = :e',
    ExpressionAttributeValues: { ':h': { S: hashResetToken(token) }, ':e': { N: expiresAt } },
    ConditionExpression: 'attribute_exists(id)',
  }));
  return { id: profile.id.S, email: profile.email?.S || email, token };
}

export async function consumePasswordReset(token: string, passwordHash: string) {
  const hash = hashResetToken(token);
  const result = await client().send(new ScanCommand({
    TableName: tableName,
    FilterExpression: 'reset_token_hash = :h',
    ExpressionAttributeValues: { ':h': { S: hash } },
    ProjectionExpression: 'id,reset_expires_at',
  }));
  const profile = result.Items?.[0];
  const expires = Number(profile?.reset_expires_at?.N || 0);
  if (!profile?.id?.S || !expires || Date.now() > expires) return false;
  await client().send(new UpdateItemCommand({
    TableName: tableName,
    Key: { id: { S: profile.id.S } },
    UpdateExpression: 'SET password_hash = :p REMOVE reset_token_hash, reset_expires_at',
    ExpressionAttributeValues: { ':p': { S: passwordHash } },
    ConditionExpression: 'reset_token_hash = :h',
  }));
  return true;
}
