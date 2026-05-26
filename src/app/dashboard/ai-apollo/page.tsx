"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, Bot, User, Copy, Check, Search, Users, List, Building2, Briefcase, ChevronDown, ChevronRight, Lightbulb, SlidersHorizontal, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface CompanyResult {
  id?: string;
  name?: string;
  website?: string;
  industry?: string;
  size?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  facebook_url?: string;
  twitter_url?: string;
  description?: string;
  headquarters_location?: string;
  founded_year?: number;
  annual_revenue?: string;
  [key: string]: any;
}

interface JobResult {
  id?: string;
  title?: string;
  company?: string;
  company_id?: string;
  location?: string;
  department?: string;
  description?: string;
  posted_at?: string;
  url?: string;
  employees_count?: string;
  industry?: string;
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

const companySearchPresets = [
  { label: "Tech Companies", query: "technology" },
  { label: "Healthcare", query: "healthcare" },
  { label: "Finance", query: "finance" },
  { label: "Retail", query: "retail" },
  { label: "Manufacturing", query: "manufacturing" },
  { label: "Software", query: "software" },
];

const jobSearchPresets = [
  { label: "Engineering Jobs", query: "engineering" },
  { label: "Sales Jobs", query: "sales" },
  { label: "Marketing Jobs", query: "marketing" },
  { label: "Product Jobs", query: "product manager" },
  { label: "Data Jobs", query: "data scientist" },
  { label: "Remote Jobs", query: "remote" },
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
  
  // Company search state
  const [companyResults, setCompanyResults] = useState<CompanyResult[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [isSearchingCompanies, setIsSearchingCompanies] = useState(false);
  
// Job search state
  const [jobResults, setJobResults] = useState<JobResult[]>([]);
  const [jobQuery, setJobQuery] = useState("");
  const [isSearchingJobs, setIsSearchingJobs] = useState(false);
  
  const [activeTab, setActiveTab] = useState("chat");
  
  // ====================== SEARCH HISTORY ======================
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('apolloSearchHistory');
    if (saved) setSearchHistory(JSON.parse(saved));
  }, []);

  const saveToHistory = (query: string) => {
    if (!query?.trim()) return;
    const newHistory = [query, ...searchHistory.filter(q => q !== query)].slice(0, 15);
    setSearchHistory(newHistory);
    localStorage.setItem('apolloSearchHistory', JSON.stringify(newHistory));
  };

const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('apolloSearchHistory');
  };

  // Handle keyboard events for textarea: Enter = search, Shift+Enter = new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, searchFn: (q: string) => void, query: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      searchFn(query);
    }
  };
  
const router = useRouter();

  // === SMART SEARCH TOGGLE STATE ===
  const [smartSearchEnabled, setSmartSearchEnabled] = useState(true);
  const [expansionResult, setExpansionResult] = useState<{
    optimizedQuery: string;
    personTitles?: string[];
    keywords?: string[];
    technologies?: string[];
    locations?: string[];
    industries?: string[];
    seniorities?: string[];
  } | null>(null);
  const [showExpansionDetails, setShowExpansionDetails] = useState(true);

  // === ENHANCED SMART QUERY EXPANSION (Claude) ===
  const expandQuery = async (rawQuery: string, type: "people" | "companies" | "jobs"): Promise<{
    optimizedQuery: string;
    personTitles?: string[];
    keywords?: string[];
    technologies?: string[];
    locations?: string[];
    industries?: string[];
    seniorities?: string[];
  }> => {
    // Build prompt based on type
    const typePrompt = type === "people" 
      ? "Extract person/job titles (e.g., Software Engineer, CTO, VP of Engineering), skills/keywords, technologies, locations, industries, and experience levels (senior, mid, junior)."
      : type === "companies"
      ? "Extract industry, company size, locations, technologies, and keywords."
      : "Extract job titles, locations, departments, industries, and keywords.";

    const prompt = `Analyze this search query and expand it intelligently. Query: "${rawQuery}"

${typePrompt}

Return JSON with this exact structure:
{
  "optimizedQuery": "refined search string optimized for Apollo API",
  "personTitles": ["title1", "title2"] (for people search),
  "keywords": ["keyword1", "keyword2"],
  "technologies": ["tech1", "tech2"],
  "locations": ["city, state", "city, state"],
  "industries": ["industry1", "industry2"],
  "seniorities": ["senior", "mid", "junior"] (for people search)
}

Example for "Python developer Miami senior":
{
  "optimizedQuery": "Python developer Miami Florida senior",
  "personTitles": ["Python Developer", "Backend Engineer", "Software Engineer"],
  "keywords": ["Python", "Django", "Flask", "backend"],
  "technologies": ["Python", "AWS", "PostgreSQL"],
  "locations": ["Miami, FL", "Miami, Florida"],
  "industries": ["Technology", "Software"],
  "seniorities": ["senior", "lead"]
}

Now analyze and return JSON for: "${rawQuery}"`;

    try {
      const res = await fetch("/api/bedrock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          assistantMode: false,
          useTools: false,
          format: "json"
        }),
      });
      const data = await res.json();

      // Try to parse JSON from response
      let expandedResult;
      try {
        const responseText = data.response || data.content || "";
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          expandedResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found");
        }
      } catch {
        // Fallback - parse manually
        expandedResult = {
          optimizedQuery: data.response || rawQuery,
          keywords: [rawQuery]
        };
      }

      console.log(`[Smart Expand] ${type}: ${rawQuery} → ${expandedResult.optimizedQuery}`);
      console.log(`[Smart Details]`, expandedResult);
      return expandedResult;
    } catch (e) {
      console.warn("Query expansion failed, using original", e);
      return {
        optimizedQuery: rawQuery,
        keywords: [rawQuery]
      };
    }
  };

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

// People search function with smart expansion
  const searchPeople = async (query: string) => {
    if (!query.trim() || isSearchingPeople) return;

    setIsSearchingPeople(true);
    setPeopleQuery(query);
    setExpansionResult(null);

    try {
      // Smart query expansion - get structured result
      let expandedData;
      if (smartSearchEnabled) {
        expandedData = await expandQuery(query, "people");
        setExpansionResult(expandedData);
      } else {
        expandedData = { optimizedQuery: query, keywords: [query] };
      }
      
      const res = await fetch("/api/apollo/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          q: expandedData.optimizedQuery,
          // Pass additional filters if smart search enabled
          ...(smartSearchEnabled && {
            titles: expandedData.personTitles,
            keywords: expandedData.keywords,
            technologies: expandedData.technologies,
            locations: expandedData.locations,
            industries: expandedData.industries,
            seniorities: expandedData.seniorities,
          })
        }),
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
        saveToHistory(query);
      } else {
        setPeopleResults([]);
      }
    } catch (err) {
      console.error("People search error:", err);
      setPeopleResults([]);
    }

setIsSearchingPeople(false);
  };

// Company search function with smart expansion
  const searchCompanies = async (query: string) => {
    if (!query.trim() || isSearchingCompanies) return;

    setIsSearchingCompanies(true);
    setCompanyQuery(query);

    try {
      // Only expand if smart search is enabled
      const expandedData = smartSearchEnabled 
        ? await expandQuery(query, "companies")
        : { optimizedQuery: query, keywords: [], industries: [], locations: [] };
      
      const res = await fetch("/api/apollo/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          q: expandedData.optimizedQuery,
          ...(smartSearchEnabled && {
            industries: expandedData.industries || [],
            locations: expandedData.locations || [],
            keywords: expandedData.keywords || [],
          })
        }),
      });
      
      const data = await res.json();
      
      if (data.companies && Array.isArray(data.companies)) {
        // Map Apollo companies to our format
        const mappedResults: CompanyResult[] = data.companies.map((c: any) => ({
          id: c.id,
          name: c.name,
          website: c.website,
          industry: c.industry,
          size: c.size,
          city: c.city,
          state: c.state,
          country: c.country,
          linkedin_url: c.linkedin_url,
          facebook_url: c.facebook_url,
          twitter_url: c.twitter_url,
          description: c.description,
          headquarters_location: c.headquarters_location,
          founded_year: c.founded_year,
          annual_revenue: c.annual_revenue,
        }));
setCompanyResults(mappedResults);
        saveToHistory(query);
      } else {
        setCompanyResults([]);
      }
    } catch (err) {
      console.error("Company search error:", err);
      setCompanyResults([]);
    }

    setIsSearchingCompanies(false);
  };

// Job search function with smart expansion
  const searchJobs = async (query: string) => {
    if (!query.trim() || isSearchingJobs) return;

    setIsSearchingJobs(true);
    setJobQuery(query);

    try {
      // Only expand if smart search is enabled
      const expandedData = smartSearchEnabled 
        ? await expandQuery(query, "jobs")
        : { optimizedQuery: query, keywords: [], locations: [], industries: [] };
      
      const res = await fetch("/api/apollo/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          q: expandedData.optimizedQuery,
          ...(smartSearchEnabled && {
            keywords: expandedData.keywords || [],
            locations: expandedData.locations || [],
            industries: expandedData.industries || [],
          })
        }),
      });
      
      const data = await res.json();
      
      if (data.jobs && Array.isArray(data.jobs)) {
        // Map jobs to our format
        const mappedResults: JobResult[] = data.jobs.map((j: any) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          company_id: j.company_id,
          location: j.location,
          department: j.department,
          description: j.description,
          posted_at: j.posted_at,
          url: j.url,
          employees_count: j.employees_count,
          industry: j.industry,
        }));
setJobResults(mappedResults);
        saveToHistory(query);
      } else {
        setJobResults([]);
      }
    } catch (err) {
      console.error("Job search error:", err);
      setJobResults([]);
    }

    setIsSearchingJobs(false);
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

{/* Global Smart Search Toggle */}
<div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card mb-6">
  <div className="flex items-center gap-3">
    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
      <Lightbulb className="h-5 w-5 text-primary" />
    </div>
    <div>
      <h3 className="font-medium">Smart Search</h3>
      <p className="text-sm text-muted-foreground">
        AI automatically expands your query with titles, skills, locations, industries, and more
      </p>
    </div>
  </div>
  <div className="flex items-center gap-3">
    <Label htmlFor="smart-search-toggle" className="text-sm font-medium">
      {smartSearchEnabled ? "AI Enhanced" : "Basic Search"}
    </Label>
    <Switch
      id="smart-search-toggle"
      checked={smartSearchEnabled}
      onCheckedChange={setSmartSearchEnabled}
    />
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
          <TabsTrigger value="companies" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Companies
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Open Roles
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
          {/* Smart Search Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Smart Search</h3>
                <p className="text-sm text-muted-foreground">
                  AI expands your query with job titles, skills, locations, and more
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="smart-search-toggle" className="text-sm font-medium">
                {smartSearchEnabled ? "ON" : "OFF"}
              </Label>
              <Switch
                id="smart-search-toggle"
                checked={smartSearchEnabled}
                onCheckedChange={setSmartSearchEnabled}
              />
            </div>
          </div>

{/* Expansion Details Card */}
          {expansionResult && smartSearchEnabled && (
            <Card className="bg-muted/50 border-primary/20">
              <CardHeader className="pb-2">
                <button
                  onClick={() => setShowExpansionDetails(!showExpansionDetails)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    AI Expansion Details
                  </CardTitle>
                  {showExpansionDetails ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </CardHeader>
              {showExpansionDetails && (
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Optimized Query */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Optimized Query</p>
                      <p className="text-sm font-medium">{expansionResult.optimizedQuery}</p>
                    </div>
                    
                    {/* Tags */}
                    <div className="flex flex-wrap gap-2">
                      {expansionResult.personTitles && expansionResult.personTitles.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">Titles:</span>
                          {expansionResult.personTitles.slice(0, 3).map((t, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {expansionResult.technologies && expansionResult.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">Tech:</span>
                          {expansionResult.technologies.slice(0, 3).map((t, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {expansionResult.locations && expansionResult.locations.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">Locations:</span>
                          {expansionResult.locations.slice(0, 2).map((l, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {l}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {expansionResult.seniorities && expansionResult.seniorities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">Level:</span>
                          {expansionResult.seniorities.slice(0, 2).map((s, i) => (
                            <Badge key={i} className="text-xs bg-amber-100 text-amber-700">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
</CardContent>
              )}
            </Card>
          )}

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

{/* Search Input with Textarea for multi-line */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Search for people (e.g., Python developer Miami with 5+ years experience in fintech)..."
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, searchPeople, peopleQuery)}
              rows={4}
              className="resize-y min-h-[100px] text-base"
              disabled={isSearchingPeople}
            />
            <Button onClick={() => searchPeople(peopleQuery)} disabled={isSearchingPeople || !peopleQuery.trim()} className="self-start mt-1 h-10">
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

          {/* Search History */}
          {searchHistory.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recent Searches
                </span>
                <Button variant="ghost" size="sm" onClick={clearHistory}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.slice(0, 6).map((past, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPeopleQuery(past);
                      searchPeople(past);
                    }}
                  >
                    {past.length > 45 ? past.substring(0, 42) + "..." : past}
                  </Button>
                ))}
              </div>
            </div>
          )}

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

        {/* Companies Tab */}
        <TabsContent value="companies" className="space-y-4">
          {/* Search Presets */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium mr-2">Quick Search:</span>
            {companySearchPresets.map((preset) => (
              <Button
                key={preset.query}
                variant="outline"
                size="sm"
                onClick={() => searchCompanies(preset.query)}
                disabled={isSearchingCompanies}
              >
                <Search className="mr-2 h-3 w-3" />
                {preset.label}
              </Button>
            ))}
          </div>

{/* Search Input with Textarea for multi-line */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Search for companies (e.g., technology companies in Miami with 50+ employees)..."
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, searchCompanies, companyQuery)}
              rows={4}
              className="resize-y min-h-[100px] text-base"
              disabled={isSearchingCompanies}
            />
            <Button onClick={() => searchCompanies(companyQuery)} disabled={isSearchingCompanies || !companyQuery.trim()} className="self-start mt-1 h-10">
              {isSearchingCompanies ? (
                <span className="animate-pulse">Searching...</span>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Search History */}
          {searchHistory.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recent Searches
                </span>
                <Button variant="ghost" size="sm" onClick={clearHistory}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.slice(0, 6).map((past, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCompanyQuery(past);
                      searchCompanies(past);
                    }}
                  >
                    {past.length > 45 ? past.substring(0, 42) + "..." : past}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {companyResults.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found {companyResults.length} companies
                </p>
              </div>
              
              {/* Results Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {companyResults.map((company, index) => (
                  <div 
                    key={company.id || index}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-card"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {company.name || 'Unknown Company'}
                        </h3>
                        {company.industry && (
                          <p className="text-sm text-muted-foreground truncate">
                            {company.industry}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {company.size && (
                        <p className="truncate">👥 {company.size} employees</p>
                      )}
                      {company.website && (
                        <a 
                          href={company.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="truncate text-blue-600 hover:underline block"
                        >
                          🌐 {company.website}
                        </a>
                      )}
                      {company.headquarters_location && (
                        <p className="truncate">📍 {company.headquarters_location}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : companyQuery && !isSearchingCompanies ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No results found. Try a different search query.</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Search for companies to add to your pipeline</p>
              <p className="text-sm mt-2">Use the presets above or enter a custom search</p>
            </div>
          )}
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          {/* Search Presets */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium mr-2">Quick Search:</span>
            {jobSearchPresets.map((preset) => (
              <Button
                key={preset.query}
                variant="outline"
                size="sm"
                onClick={() => searchJobs(preset.query)}
                disabled={isSearchingJobs}
              >
                <Search className="mr-2 h-3 w-3" />
                {preset.label}
              </Button>
            ))}
          </div>

{/* Search Input with Textarea for multi-line */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Search for open roles (e.g., senior software engineer remote in fintech)..."
              value={jobQuery}
              onChange={(e) => setJobQuery(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, searchJobs, jobQuery)}
              rows={4}
              className="resize-y min-h-[100px] text-base"
              disabled={isSearchingJobs}
            />
            <Button onClick={() => searchJobs(jobQuery)} disabled={isSearchingJobs || !jobQuery.trim()} className="self-start mt-1 h-10">
              {isSearchingJobs ? (
                <span className="animate-pulse">Searching...</span>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Search History */}
          {searchHistory.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Recent Searches
                </span>
                <Button variant="ghost" size="sm" onClick={clearHistory}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.slice(0, 6).map((past, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setJobQuery(past);
                      searchJobs(past);
                    }}
                  >
                    {past.length > 45 ? past.substring(0, 42) + "..." : past}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {jobResults.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found {jobResults.length} open positions
                </p>
              </div>
              
              {/* Results Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {jobResults.map((job, index) => (
                  <div 
                    key={job.id || index}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-card"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {job.title || 'Open Role'}
                        </h3>
                        {job.company && (
                          <p className="text-sm text-muted-foreground truncate">
                            {job.company}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {job.location && (
                        <p className="truncate">📍 {job.location}</p>
                      )}
                      {job.department && (
                        <p className="truncate">🏢 {job.department}</p>
                      )}
                      {job.url && (
                        <a 
                          href={job.url}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="truncate text-blue-600 hover:underline block"
                        >
                          🔗 View Job
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : jobQuery && !isSearchingJobs ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No results found. Try a different search query.</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Search for open roles to track</p>
              <p className="text-sm mt-2">Use the presets above or enter a custom search</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
