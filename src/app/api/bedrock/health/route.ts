/**
 * Bedrock Health Check Endpoint
 * 
 * Provides diagnostic information for debugging Bedrock API issues.
 * Returns environment configuration status and AWS connectivity info.
 * 
 * @serverOnly
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// Health Check Response Interface
// ============================================================================

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  region: string;
  envVars: {
    AWS_REGION: boolean;
    AWS_ACCESS_KEY_ID: boolean;
    AWS_SECRET_ACCESS_KEY: boolean;
    AWS_BEDROCK_ENDPOINT: boolean;
  };
  modelAccess: {
    haiku: boolean;
    sonnet: boolean;
    opus: boolean;
  };
  latency?: {
    haiku?: number;
    sonnet?: number;
  };
  error?: string;
}

// ============================================================================
// Model IDs
// ============================================================================

const MODEL_HAIKU = "us.anthropic.claude-haiku-4-2025-01-15";
const MODEL_SONNET = "us.anthropic.claude-sonnet-4-6-20250219";
const MODEL_OPUS = "us.anthropic.claude-opus-4-7-2025-01-15";

// ============================================================================
// Test Model Connectivity
// ============================================================================

async function testModelAccess(client: BedrockRuntimeClient, modelId: string): Promise<boolean> {
  try {
    const input = {
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        temperature: 0.7,
      }),
    };

    const command = new InvokeModelCommand(input);
    await client.send(command);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Measure Latency
// ============================================================================

async function measureLatency(client: BedrockRuntimeClient, modelId: string): Promise<number | null> {
  try {
    const startTime = Date.now();
    
    const input = {
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        temperature: 0.7,
      }),
    };

    const command = new InvokeModelCommand(input);
    await client.send(command);
    
    return Date.now() - startTime;
  } catch {
    return null;
  }
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    region: process.env.AWS_REGION || "us-east-1",
    envVars: {
      AWS_REGION: !!process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: !!process.env.AWS_SECRET_ACCESS_KEY,
      AWS_BEDROCK_ENDPOINT: !!process.env.AWS_BEDROCK_ENDPOINT,
    },
    modelAccess: {
      haiku: false,
      sonnet: false,
      opus: false,
    },
  };

  // Check if AWS_REGION is configured
  if (!process.env.AWS_REGION) {
    health.status = "unhealthy";
    health.error = "AWS_REGION not configured";
    
    return NextResponse.json(health, { status: 503 });
  }

  // Create Bedrock client
  const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION,
  });

  // Check model access (limited check - just Haiku for speed)
  try {
    console.log("Testing Haiku model access...");
    health.modelAccess.haiku = await testModelAccess(bedrockClient, MODEL_HAIKU);
    
    if (health.modelAccess.haiku) {
      // Measure latency if model is accessible
      health.latency = {
        haiku: await measureLatency(bedrockClient, MODEL_HAIKU) || undefined,
      };
    }
  } catch (err) {
    health.status = "degraded";
    health.error = err instanceof Error ? err.message : "Model access check failed";
  }

  // Determine overall status
  if (!health.modelAccess.haiku) {
    health.status = "unhealthy";
    if (!health.error) {
      health.error = "Unable to access Haiku model - check AWS credentials and model permissions";
    }
  }

  const statusCode = health.status === "healthy" ? 200 : 
    health.status === "degraded" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
