"use client";

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// AWS Configuration  
const region = process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";

// Initialize Bedrock client - credentials come from env vars, config file, or IAM role automatically
const bedrockClient = new BedrockRuntimeClient({ region });

// Default model - can use Claude 3 Haiku (fast/cheap) or Sonnet (more capable)
const DEFAULT_MODEL = "anthropic.claude-3-haiku-20240307-v1:0";

export async function getBedrockChatCompletion(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  model: string = DEFAULT_MODEL
) {
  try {
    // Convert messages to Anthropic format
    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    const conversation = messages.filter(m => m.role !== "system");
    
    // Build the prompt in Anthropic format
    let prompt = "";
    for (const msg of conversation) {
      if (msg.role === "user") {
        prompt += `\n\nHuman: ${msg.content}`;
      } else if (msg.role === "assistant") {
        prompt += `\n\nAssistant: ${msg.content}`;
      }
    }
    prompt += "\n\nAssistant:";

    const input = {
      modelId: model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "2023-06-01",
        system: systemMessage,
        messages: conversation.map(msg => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content
        })),
        max_tokens: 1024,
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);

    // Parse the response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const completion = responseBody.content?.[0]?.text || responseBody.completion || "";
    
    return { response: completion };
  } catch (err) {
    console.error("Bedrock error:", err);
    return { error: String(err) };
  }
}
