"use client";

import { useState, useEffect } from "react";
import { Send, Sparkles, Bot, User, Copy, Check, Cloud, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type AiProvider = "bedrock" | "anthropic";

const quickActions = [
  "Find construction companies in Boca Raton",
  "Search for latest news on AI",
  "What is the weather in Miami?",
  "Find software companies in South Florida",
];

const sourcingActions = [
  { label: "Python Developer Miami", query: "Python developer Miami" },
  { label: "React Developer Remote", query: "React developer remote" },
  { label: "AWS Engineer South Florida", query: "AWS engineer South Florida" },
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProvider>("bedrock");
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [lastProviderUsed, setLastProviderUsed] = useState<string | null>(null);

// Set welcome message after mount to avoid hydration mismatch
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant" as const,
        content:
          "✅ AI Assistant ready. Use Platform Bedrock or your own Anthropic key (Settings → AI Providers). What would you like to source?",
        timestamp: new Date(),
      },
    ]);

    // Load preferred provider + whether BYOK key exists
    fetch("/api/ai/credentials")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setHasAnthropicKey(!!data.hasAnthropicKey);
        if (data.preferredProvider === "anthropic" && data.hasAnthropicKey) {
          setProvider("anthropic");
        }
      })
      .catch(() => {});
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    if (provider === "anthropic" && !hasAnthropicKey) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "user",
          content,
          timestamp: new Date(),
        },
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "No Anthropic API key on file. Add one under Settings → AI Providers, or switch to Platform (Bedrock).",
          timestamp: new Date(),
        },
      ]);
      setInput("");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

// Build conversation context for Bedrock
    const chatMessages = [
      {
        role: "system" as const,
content: "You are a helpful AI assistant. You can help with a wide range of tasks including answering questions, writing, analysis, and more. Be concise and helpful.",
      },
      ...messages.slice(-6).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content },
    ];

// Call our API route — platform Bedrock or Anthropic BYOK
const res = await fetch("/api/bedrock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatMessages,
        useSearch: true,
        useTools: true,
        provider,
      }),
    });
    const result = await res.json();
    if (result.provider) setLastProviderUsed(result.provider);

    let assistantMessage: Message;
    if (result.error) {
      // Fallback response when Bedrock fails
      assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.suggestion 
          ? `${result.message || result.error}\n\nTip: ${result.suggestion}`
          : result.message || result.error || "I'm having trouble connecting to my AI brain right now. Try again in a moment or ask me something simpler.",
        timestamp: new Date(),
      };
    } else {
      assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.response || "I couldn't generate a response. Please try again.",
        timestamp: new Date(),
      };
    }

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
  };

const copyToClipboard = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Generate Boolean query and open LinkedIn search directly
  const runSourcingSearch = async (query: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/boolean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: query, platform: "linkedin" }),
      });
      const data = await res.json();
      if (data.success && data.platform_url) {
        // Open LinkedIn search in new tab
        window.open(data.platform_url, "_blank");
      }
    } catch (err) {
      console.error("Sourcing error:", err);
    }
    setIsLoading(false);
  };

  // Parse URLs from content to make them clickable
  const renderContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">AI Assistant (Web)</h1>
          <p className="text-muted-foreground">
            Claude + Apollo + Tavily — Platform Bedrock or your Anthropic key
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Provider switch */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setProvider("bedrock")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                provider === "bedrock"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              Platform
            </button>
            <button
              type="button"
              onClick={() => setProvider("anthropic")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                provider === "anthropic"
                  ? "bg-violet-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              title={
                hasAnthropicKey
                  ? "Use your Anthropic API key"
                  : "Add a key in Settings first"
              }
            >
              <KeyRound className="h-3.5 w-3.5" />
              My key
              {!hasAnthropicKey && (
                <span className="opacity-70 font-normal">(setup)</span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                provider === "anthropic" ? "bg-violet-500" : "bg-emerald-500"
              }`}
            />
            <span className="text-muted-foreground text-xs">
              {provider === "anthropic"
                ? hasAnthropicKey
                  ? "Anthropic BYOK"
                  : "Key missing"
                : "Bedrock"}
              {lastProviderUsed ? ` · last: ${lastProviderUsed}` : ""}
            </span>
          </div>
          <Link
            href="/dashboard/settings"
            className="text-xs text-blue-600 hover:underline"
          >
            AI settings
          </Link>
        </div>
      </div>

{/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <Button
            key={action}
            variant="outline"
            size="sm"
            onClick={() => sendMessage(action)}
            disabled={isLoading}
          >
            <Sparkles className="mr-2 h-3 w-3" />
            {action}
          </Button>
        ))}
</div>

{/* Sourcing Actions - directly open LinkedIn searches */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm font-medium mr-2">Candidate Search:</span>
        {sourcingActions.map((action) => (
          <Button
            key={action.query}
            variant="secondary"
            size="sm"
            onClick={() => runSourcingSearch(action.query)}
            disabled={isLoading}
          >
            <Sparkles className="mr-2 h-3 w-3" />
            {action.label}
          </Button>
        ))}
      </div>

{/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-lg border border-border bg-muted/30">
        {messages.length === 0 ? (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-background border border-border rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Loading assistant...</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.role === "assistant" && (
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === message.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
                <p className="text-xs opacity-50 mt-2">
                  {typeof message.timestamp === "string" ? message.timestamp : message.timestamp.toLocaleTimeString()}
                </p>
              </div>
              {message.role === "user" && (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && messages.length > 0 && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-background border border-border rounded-lg p-3">
              <p className="text-sm animate-pulse">Thinking...</p>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Ask anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) {
              sendMessage(input);
            }
          }}
          disabled={isLoading}
        />
        <Button onClick={() => sendMessage(input)} disabled={isLoading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
