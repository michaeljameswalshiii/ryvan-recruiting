/**
 * Cheap live dependency checks. Avoid paid/slow provider pings.
 * @serverOnly
 */

import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { getRawDynamoClient, getTableName } from "@/lib/db/dynamodb";
import type { DependencyHealth } from "./types";

async function probeDynamo(): Promise<DependencyHealth> {
  const started = performance.now();
  try {
    await getRawDynamoClient().send(
      new GetItemCommand({
        TableName: getTableName("profiles"),
        Key: { id: { S: "__performance_probe__" } },
        ConsistentRead: true,
        ProjectionExpression: "id",
      })
    );
    const latencyMs = Math.round(performance.now() - started);
    return {
      id: "dynamodb",
      label: "DynamoDB",
      status: latencyMs > 250 ? "degraded" : "healthy",
      detail:
        latencyMs > 250
          ? `Round trip ${latencyMs} ms — lists and saves will feel sluggish`
          : `Round trip ${latencyMs} ms`,
      latencyMs,
    };
  } catch (err) {
    return {
      id: "dynamodb",
      label: "DynamoDB",
      status: "incident",
      detail: err instanceof Error ? err.message : "Probe failed",
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

function envHealth(
  id: string,
  label: string,
  ready: boolean,
  readyDetail: string,
  missingDetail: string
): DependencyHealth {
  return {
    id,
    label,
    status: ready ? "healthy" : "degraded",
    detail: ready ? readyDetail : missingDetail,
  };
}

export async function getDependencyHealth(): Promise<DependencyHealth[]> {
  const dynamo = await probeDynamo();
  const bedrockReady = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );
  const apolloReady = Boolean(
    process.env.APOLLO_API_KEY ||
      process.env.APOLLO_MASTER_API_KEY ||
      process.env.Apollo_API_key
  );
  const smsReady = Boolean(
    process.env.AWS_SMS_ORIGINATION_IDENTITY ||
      process.env.AWS_SMS_ORIGINATION_NUMBER ||
      process.env.PINPOINT_SMS_ORIGINATION_IDENTITY
  );
  const emailReady = Boolean(
    process.env.GOOGLE_CLIENT_ID ||
      process.env.GMAIL_CLIENT_ID ||
      process.env.MICROSOFT_CLIENT_ID ||
      process.env.RESEND_API_KEY
  );
  const cronReady = Boolean(process.env.CRON_SECRET);

  return [
    dynamo,
    envHealth(
      "bedrock",
      "AI / Bedrock",
      bedrockReady,
      "AWS credentials present",
      "AWS credentials missing — AI calls will fail"
    ),
    envHealth(
      "apollo",
      "Apollo",
      apolloReady,
      "API key configured",
      "No Apollo key — sourcing lookups will fail"
    ),
    envHealth(
      "sms",
      "SMS / Pinpoint",
      smsReady,
      "Origination identity configured",
      "SMS origination identity is not set"
    ),
    envHealth(
      "email",
      "Email OAuth",
      emailReady,
      "At least one mail provider is configured",
      "No Gmail, Outlook, or Resend credentials"
    ),
    envHealth(
      "cron",
      "Vercel Cron auth",
      cronReady,
      "CRON_SECRET is set",
      "CRON_SECRET missing — scheduled jobs will 401 in production"
    ),
  ];
}
