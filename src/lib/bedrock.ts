/**
 * Bedrock Client Wrapper (LEGACY - DEPRECATED)
 * 
 * ⚠️ WARNING: This file is deprecated!
 * 
 * All Bedrock AI calls should go through the server-side API route:
 * POST /api/bedrock
 * 
 * This client-side wrapper is kept for backward compatibility only.
 * In production, it will throw an error to prevent credential exposure.
 * 
 * @deprecated Use /api/bedrock API route instead
 */

"use client";

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// AWS Configuration - NOTE: This exposes region to client bundle
// Use server-side API route (/api/bedrock) instead
const region = process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";

// Block in production to prevent credential exposure
if (process.env.NODE_ENV === "production") {
  throw new Error(
    "bedrock.ts is deprecated. Use server-side API route: POST /api/bedrock"
  );
}

// Initialize Bedrock client - credentials come from env vars, config file, or IAM role automatically
const bedrockClient = new BedrockRuntimeClient({ region });

// Default model - Using MiniMax for better performance
const DEFAULT_MODEL = "minimax.minimax-m2.5";

export async function getBedrockChatCompletion(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  model: string = DEFAULT_MODEL
) {
  try {
    // Extract system message
    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    const conversation = messages.filter(m => m.role !== "system");
    
    // Build messages in MiniMax format
    const mmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];
    
    if (systemMessage) {
      mmMessages.push({ role: "system", content: systemMessage });
    }
    
    for (const msg of conversation) {
      mmMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      });
    }

    const input = {
      modelId: model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: mmMessages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);

    // Parse the response - MiniMax format
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const completion = 
      responseBody.choices?.[0]?.message?.content || 
      responseBody.output?.message?.content?.[0]?.text ||
      responseBody.completion || 
      "";
    
    return { response: completion };
  } catch (err) {
    console.error("Bedrock error:", err);
    return { error: String(err) };
  }
}
