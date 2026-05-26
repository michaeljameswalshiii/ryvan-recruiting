'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, Bot, User, Copy, Check, Search, Users, List, Building2, Briefcase, ChevronDown, ChevronRight, Lightbulb, SlidersHorizontal, Clock, Trash2 } from "lucide-react";
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

// ... (keep all your quickActions, presets, etc.)

export default function AIAssistantPage() {
  // ... (keep all your existing state variables)

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

  // ... (keep all your existing functions: sendMessage, expandQuery, searchPeople, searchCompanies, searchJobs, etc.)

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Apollo</h1>
          <p className="text-muted-foreground">Powered by Claude - AI Assistant (Web)</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span className="text-muted-foreground">Apollo Connected</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="people">People Search</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="jobs">Open Roles</TabsTrigger>
        </TabsList>

        {/* Chat Tab - unchanged */}
        <TabsContent value="chat" className="space-y-4">
          {/* ... your existing chat tab code ... */}
        </TabsContent>

        {/* ==================== PEOPLE SEARCH TAB ==================== */}
        <TabsContent value="people" className="space-y-4">
          {/* Smart Search Toggle + Quick Search Presets (keep as is) */}

          {/* Improved Multi-line Search */}
          <div className="flex gap-3">
            <Textarea
              placeholder="Search for people (e.g., Python developer Miami with 5+ years experience in fintech, leadership skills...)"
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, searchPeople, peopleQuery)}
              rows={5}
              className="resize-y min-h-[140px] text-base"
              disabled={isSearchingPeople}
            />
            <Button 
              onClick={() => searchPeople(peopleQuery)} 
              disabled={isSearchingPeople || !peopleQuery.trim()} 
              className="self-start mt-1 h-12 px-8"
            >
              {isSearchingPeople ? "Searching..." : <Search className="h-5 w-5" />}
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
                    onClick={() => { setPeopleQuery(past); searchPeople(past); }}
                  >
                    {past.length > 45 ? past.substring(0, 42) + "..." : past}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Results section - keep as is */}
          {/* ... your existing results code ... */}
        </TabsContent>

        {/* ==================== COMPANIES TAB ==================== */}
        <TabsContent value="companies" className="space-y-4">
          <div className="flex gap-3">
            <Textarea
              placeholder="Search for companies (e.g., SaaS companies in fintech, Series B, Austin...)"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, searchCompanies, companyQuery)}
              rows={5}
              className="resize-y min-h-[140px] text-base"
              disabled={isSearchingCompanies}
            />
            <Button 
              onClick={() => searchCompanies(companyQuery)} 
              disabled={isSearchingCompanies || !companyQuery.trim()} 
              className="self-start mt-1 h-12 px-8"
            >
              {isSearchingCompanies ? "Searching..." : <Search className="h-5 w-5" />}
            </Button>
          </div>

          {/* Search History - same as above */}
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
                    onClick={() => { setCompanyQuery(past); searchCompanies(past); }}
                  >
                    {past.length > 45 ? past.substring(0, 42) + "..." : past}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
        </TabsContent>

        {/* ==================== JOBS TAB ==================== */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex gap-3">
            <Textarea
              placeholder="Search for open roles (e.g., senior software engineer remote in fintech, $140k+...)"
              value={jobQuery}
              onChange={(e) => setJobQuery(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, searchJobs, jobQuery)}
              rows={5}
              className="resize-y min-h-[140px] text-base"
              disabled={isSearchingJobs}
            />
            <Button 
              onClick={() => searchJobs(jobQuery)} 
              disabled={isSearchingJobs || !jobQuery.trim()} 
              className="self-start mt-1 h-12 px-8"
            >
              {isSearchingJobs ? "Searching..." : <Search className="h-5 w-5" />}
            </Button>
          </div>

          {/* Search History - same */}
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
                    onClick={() => { setJobQuery(past); searchJobs(past); }}
                  >
                    {past.length > 45 ? past.substring(0, 42) + "..." : past}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
