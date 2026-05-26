'use client';

import { useState, useEffect } from "react";
import { Send, Sparkles, Bot, User, Copy, Check, Search, Users, Building2, Briefcase, ChevronDown, ChevronRight, Lightbulb, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaveCandidateButton } from "@/components/candidate-import";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface PersonResult { [key: string]: any; }
interface CompanyResult { [key: string]: any; }
interface JobResult { [key: string]: any; }

// Keep all your existing presets and quick actions
const quickActions = [ /* ... your existing quickActions ... */ ];
const peopleSearchPresets = [ /* ... your presets ... */ ];
const companySearchPresets = [ /* ... */ ];
const jobSearchPresets = [ /* ... */ ];

export default function AIAssistantPage() {
  // ==================== EXISTING STATES ====================
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search states
  const [peopleResults, setPeopleResults] = useState<PersonResult[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);

  const [companyResults, setCompanyResults] = useState<CompanyResult[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [isSearchingCompanies, setIsSearchingCompanies] = useState(false);

  const [jobResults, setJobResults] = useState<JobResult[]>([]);
  const [jobQuery, setJobQuery] = useState("");
  const [isSearchingJobs, setIsSearchingJobs] = useState(false);

  const [activeTab, setActiveTab] = useState("chat");

  // Smart Search
  const [smartSearchEnabled, setSmartSearchEnabled] = useState(true);
  const [expansionResult, setExpansionResult] = useState<any>(null);
  const [showExpansionDetails, setShowExpansionDetails] = useState(true);

  // ==================== SEARCH HISTORY ====================
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, searchFn: (q: string) => void, query: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      searchFn(query);
    }
  };

  // ... Keep all your existing functions (sendMessage, expandQuery, searchPeople, searchCompanies, searchJobs, etc.)

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Apollo</h1>
          <p className="text-muted-foreground">Powered by Claude - AI Assistant (Web)</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span className
