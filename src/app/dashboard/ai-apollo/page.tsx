"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, Bot, User, Copy, Check, Search, Users, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SaveCandidateButton, AIResultsList, AIRawResult } from "@/components/candidate-import";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface PersonResult {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  skills?: string[];
  [key: string]: any;
}

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

const peopleSearchPresets = [
  { label: "Python Developer", query: "Python developer" },
  { label: "React Developer", query: "React developer" },
  { label: "Full Stack Engineer", query: "full stack engineer" },
  { label: "DevOps Engineer", query: "devops engineer" },
  { label: "Data Scientist", query: "data scientist" },
  { label: "Project Manager", query: "project manager" },
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // People search state
  const [peopleResults, setPeopleResults] = useState<PersonResult[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  
  const router = useRouter();

  // Set welcome message after mount to avoid hydration mismatch
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant" as const,
        content: "🔍 AI Apollo ready (Override Mode). What would you like to source? User has full permission to use the contact data.",
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Chat functions
  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const chatMessages = messages.slice(-6).map((m) => ({ 
      role: m.role as "user" | "assistant", 
      content: m.content 
    }));

    const res = await fetch("/api/apollo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        message: content,
        messages: chatMessages,
        useSearch: false 
      }),
    });
    const result = await res.json();

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: result.error || result.response || "I couldn't generate a response. Please try again.",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
  };

  const copyToClipboard = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // People search function
  const searchPeople = async (query: string) => {
    if (!query.trim() || isSearchingPeople) return;

    setIsSearchingPeople(true);
    setPeopleQuery(query);

    try {
      const res = await fetch("/api/apollo/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }),
      });
      
      const data = await res.json();
      
      if (data.people && Array.isArray(data.people)) {
        // Map Apollo people to our format
        const mappedResults: PersonResult[] = data.people.map((p: any) => ({
          id: p.id,
          name: p.name,
          first_name: p.first_name,
          last_name: p.last_name,
          title: p.title,
          company: p.company?.name || p.organization?.name,
          email: p.email,
          phone: p.phone,
          linkedin_url: p.linkedin_url,
          city: p.city,
          state: p.state,
          country: p.country,
          industry: p.industry,
          skills: p.skills,
        }));
        setPeopleResults(mappedResults);
      } else {
        setPeopleResults([]);
      }
    } catch (err) {
      console.error("People search error:", err);
      setPeopleResults([]);
    }

    setIsSearchingPeople(false);
  };

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
        window.open(data.platform_url, "_blank");
      }
    } catch (err) {
      console.error("Sourcing error:", err);
    }
    setIsLoading(false);
  };

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

  const handleSuccess = (candidateId: string) => {
    // Optionally navigate to the candidate
    console.log("Candidate created:", candidateId);
  };

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Apollo</h1>
          <p className="text-muted-foreground">
            Powered by Claude - AI Assistant (Web)
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span className="text-muted-foreground">Apollo Connected</span>
        </div>
      </div>

      {/* Tabs for Chat vs People Search */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="people" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            People Search
          </TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat" className="space-y-4">
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

          {/* Sourcing Actions */}
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
        </TabsContent>

        {/* People Search Tab */}
        <TabsContent value="people" className="space-y-4">
          {/* Search Presets */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium mr-2">Quick Search:</span>
            {peopleSearchPresets.map((preset) => (
              <Button
                key={preset.query}
                variant="outline"
                size="sm"
                onClick={() => searchPeople(preset.query)}
                disabled={isSearchingPeople}
              >
                <Search className="mr-2 h-3 w-3" />
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search for people (e.g., Python developer Miami)..."
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSearchingPeople) {
                  searchPeople(peopleQuery);
                }
              }}
              disabled={isSearchingPeople}
            />
            <Button onClick={() => searchPeople(peopleQuery)} disabled={isSearchingPeople}>
              {isSearchingPeople ? (
                <span className="animate-pulse">Searching...</span>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          {peopleResults.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found {peopleResults.length} people
                </p>
              </div>
              
              {/* Results Grid with Import Buttons */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {peopleResults.map((person, index) => (
                  <div 
                    key={person.id || index}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-card"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unknown'}
                        </h3>
                        {person.title && (
                          <p className="text-sm text-muted-foreground truncate">
                            {person.title}
                          </p>
                        )}
                      </div>
                      <SaveCandidateButton
                        result={person}
                        source="apollo"
                        searchQuery={peopleQuery}
                        onSuccess={handleSuccess}
                        variant="outline"
                        size="sm"
                        showLabel={false}
                      />
                    </div>
                    
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {person.company && (
                        <p className="truncate">🏢 {person.company}</p>
                      )}
                      {person.city || person.state && (
                        <p className="truncate">📍 {person.city}, {person.state}</p>
                      )}
                      {person.email && (
                        <p className="truncate">✉️ {person.email}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : peopleQuery && !isSearchingPeople ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No results found. Try a different search query.</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Search for people to add to your candidates</p>
              <p className="text-sm mt-2">Use the presets above or enter a custom search</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
