/**
 * Dashboard Settings Page
 * User settings and preferences including email connections
 * 
 * @clientOnly
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Mail,
  Link2,
  Unlink,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  KeyRound,
  Cloud,
  Users,
  Building2,
  CreditCard,
  Terminal,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/roles';
import { TeamSettings } from '@/components/settings/TeamSettings';
import { OrgSettings } from '@/components/settings/OrgSettings';
import { PlanSettings } from '@/components/settings/PlanSettings';
import { McpKeysSettings } from '@/components/settings/McpKeysSettings';
import { ApolloSettings } from '@/components/settings/ApolloSettings';
import { TextingSettings } from '@/components/settings/TextingSettings';

interface EmailConnection {
  provider: 'gmail' | 'outlook';
  emailAddress: string;
  status: string;
  lastSyncedAt?: string;
  createdAt?: string;
}

interface ActiveConnection {
  provider: 'gmail' | 'outlook';
  emailAddress: string;
}

type AiProvider = 'bedrock' | 'anthropic' | 'openai' | 'gemini' | 'grok';
type ByokKeyProvider = 'anthropic' | 'openai' | 'gemini' | 'grok';

interface AiCredStatus {
  preferredProvider: AiProvider;
  hasAnthropicKey: boolean;
  anthropicKeyHint?: string;
  hasOpenaiKey: boolean;
  openaiKeyHint?: string;
  hasGeminiKey: boolean;
  geminiKeyHint?: string;
  hasGrokKey: boolean;
  grokKeyHint?: string;
}

type SettingsTab =
  | 'account'
  | 'team'
  | 'organization'
  | 'plan'
  | 'integrations'
  | 'texting';

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>('account');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [activeConnections, setActiveConnections] = useState<ActiveConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const canTeamAdmin = hasPermission(userRole, 'team_admin');
  
  // Check if OAuth is configured (these would come from env vars on the server side)
  // For client-side, we check via the API response
  const [gmailConfigured, setGmailConfigured] = useState<boolean | null>(null);
  const [outlookConfigured, setOutlookConfigured] = useState<boolean | null>(null);

  // AI BYOK
  const [aiStatus, setAiStatus] = useState<AiCredStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [grokKeyInput, setGrokKeyInput] = useState('');
  const [aiSaving, setAiSaving] = useState<ByokKeyProvider | null>(null);
  const [aiRemoving, setAiRemoving] = useState<ByokKeyProvider | null>(null);
  
  // Get user ID from session (in real app, get from auth)
  const userId = 'demo-user'; // TODO: Get from session
  
  // Handle OAuth callback messages
  useEffect(() => {
    const emailConnected = searchParams.get('email_connected');
    const emailError = searchParams.get('email_error');
    
    if (emailConnected) {
      toast.success(`Email connected: ${emailConnected}`);
      // Refresh connections
      fetchConnections();
    }
    if (emailError) {
      toast.error(`Email error: ${emailError}`);
    }
  }, [searchParams]);
  
  // Check if OAuth is configured (dedicated status route — no Google redirect / CORS)
  const checkOAuthConfig = async () => {
    try {
      const res = await fetch('/api/email/oauth/status', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setGmailConfigured(false);
        setOutlookConfigured(false);
        return;
      }
      const data = await res.json();
      setGmailConfigured(data.gmail === true);
      setOutlookConfigured(data.outlook === true);
    } catch (error) {
      console.error('Failed to check OAuth config:', error);
      setGmailConfigured(false);
      setOutlookConfigured(false);
    }
  };
  
  // Fetch email connections
  const fetchConnections = async () => {
    try {
      const response = await fetch(`/api/email/connections?userId=${userId}`);
      const data = await response.json();
      
      if (data.connections) {
        setConnections(data.connections);
        setActiveConnections(data.activeConnections || []);
      }
    } catch (error) {
      console.error('Failed to fetch connections:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const emptyAiStatus = (): AiCredStatus => ({
    preferredProvider: 'bedrock',
    hasAnthropicKey: false,
    hasOpenaiKey: false,
    hasGeminiKey: false,
    hasGrokKey: false,
  });

  const mapAiStatus = (data: any, prev?: AiCredStatus | null): AiCredStatus => ({
    preferredProvider: data.preferredProvider || prev?.preferredProvider || 'bedrock',
    hasAnthropicKey: data.hasAnthropicKey ?? prev?.hasAnthropicKey ?? false,
    anthropicKeyHint: data.anthropicKeyHint ?? prev?.anthropicKeyHint,
    hasOpenaiKey: data.hasOpenaiKey ?? prev?.hasOpenaiKey ?? false,
    openaiKeyHint: data.openaiKeyHint ?? prev?.openaiKeyHint,
    hasGeminiKey: data.hasGeminiKey ?? prev?.hasGeminiKey ?? false,
    geminiKeyHint: data.geminiKeyHint ?? prev?.geminiKeyHint,
    hasGrokKey: data.hasGrokKey ?? prev?.hasGrokKey ?? false,
    grokKeyHint: data.grokKeyHint ?? prev?.grokKeyHint,
  });

  const fetchAiCredentials = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/credentials', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAiStatus(mapAiStatus(data));
      } else {
        // Still show UI with empty keys if unauthorized / error
        setAiStatus(emptyAiStatus());
        if (res.status === 401) {
          console.warn('[settings] AI credentials: not signed in');
        }
      }
    } catch (err) {
      console.error('Failed to load AI credentials', err);
      setAiStatus(emptyAiStatus());
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    checkOAuthConfig();
    fetchAiCredentials();
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.user?.role || null);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [userId]);

  const byokLabels: Record<ByokKeyProvider, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Gemini',
    grok: 'Grok',
  };

  const saveProviderKey = async (keyProvider: ByokKeyProvider) => {
    const value =
      keyProvider === 'anthropic'
        ? anthropicKeyInput
        : keyProvider === 'openai'
          ? openaiKeyInput
          : keyProvider === 'gemini'
            ? geminiKeyInput
            : grokKeyInput;
    if (!value.trim()) {
      toast.error(`Paste your ${byokLabels[keyProvider]} API key first`);
      return;
    }
    setAiSaving(keyProvider);
    try {
      const res = await fetch('/api/ai/credentials', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyProvider,
          apiKey: value.trim(),
          setAsPreferred: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save key');
        return;
      }
      toast.success(`${byokLabels[keyProvider]} key saved and validated`);
      if (keyProvider === 'anthropic') setAnthropicKeyInput('');
      else if (keyProvider === 'openai') setOpenaiKeyInput('');
      else if (keyProvider === 'gemini') setGeminiKeyInput('');
      else setGrokKeyInput('');
      setAiStatus(mapAiStatus(data));
    } catch {
      toast.error(`Failed to save ${byokLabels[keyProvider]} key`);
    } finally {
      setAiSaving(null);
    }
  };

  const setAiProvider = async (preferredProvider: AiProvider) => {
    try {
      const res = await fetch('/api/ai/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setPreferred', preferredProvider }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not update provider');
        return;
      }
      setAiStatus((prev) => mapAiStatus(data, prev));
      const labels: Record<AiProvider, string> = {
        bedrock: 'Using Platform Bedrock',
        anthropic: 'Using your Anthropic key',
        openai: 'Using your OpenAI key',
        gemini: 'Using your Gemini key',
        grok: 'Using your Grok key',
      };
      toast.success(labels[preferredProvider]);
    } catch {
      toast.error('Failed to update provider');
    }
  };

  const removeProviderKey = async (keyProvider: ByokKeyProvider) => {
    if (!confirm(`Remove your saved ${byokLabels[keyProvider]} API key?`)) return;
    setAiRemoving(keyProvider);
    try {
      const res = await fetch(
        `/api/ai/credentials?provider=${keyProvider}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove key');
        return;
      }
      toast.success(`${byokLabels[keyProvider]} key removed`);
      setAiStatus(mapAiStatus(data));
    } catch {
      toast.error('Failed to remove key');
    } finally {
      setAiRemoving(null);
    }
  };
  
  // Connect Gmail
  const connectGmail = () => {
    if (!gmailConfigured) {
      toast.error('Gmail OAuth is not configured. Please contact your administrator.');
      return;
    }
    window.location.href = `/api/email/oauth/gmail?userId=${userId}`;
  };
  
  // Connect Outlook
  const connectOutlook = () => {
    if (!outlookConfigured) {
      toast.error('Outlook OAuth is not configured. Please contact your administrator.');
      return;
    }
    window.location.href = `/api/email/oauth/outlook?userId=${userId}`;
  };
  
// Disconnect email
  const disconnectEmail = async (provider: string) => {
    if (!confirm(`Are you sure you want to disconnect ${provider}?`)) return;
    
    try {
      const response = await fetch(`/api/email/connections/${provider}?userId=${userId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`${provider} disconnected`);
        fetchConnections();
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (error) {
      toast.error('Failed to disconnect');
    }
  };
  
  // Test email connection
  const testConnection = async (provider: string) => {
    if (!confirm(`Send a test email to verify your ${provider} connection?`)) return;
    
    const testEmail = prompt('Enter your email address to receive the test:');
    if (!testEmail) return;
    
    setTesting(provider);
    
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to: testEmail,
          subject: 'Test Email - Trio Recruiting',
          text: 'This is a test email from your ATS. If you received this, your email connection is working!',
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Test email sent!');
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (error) {
      toast.error('Failed to send test email');
    } finally {
      setTesting(null);
    }
  };
  
  // Get connection status
  const gmailConnection = connections.find(c => c.provider === 'gmail');
  const outlookConnection = connections.find(c => c.provider === 'outlook');
  
  const isGmailConnected = activeConnections.some(c => c.provider === 'gmail');
  const isOutlookConnected = activeConnections.some(c => c.provider === 'outlook');
  
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'account', label: 'Account', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'team', label: 'Team', icon: <Users className="h-4 w-4" />, adminOnly: true },
    { id: 'organization', label: 'Organization', icon: <Building2 className="h-4 w-4" />, adminOnly: true },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: <Terminal className="h-4 w-4" />,
      adminOnly: true,
    },
    {
      id: 'texting',
      label: 'Texting',
      icon: <MessageSquare className="h-4 w-4" />,
    },
    { id: 'plan', label: 'Plan', icon: <CreditCard className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account, team, organization, and plan
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs
          .filter((t) => !t.adminOnly || canTeamAdmin)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-200'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'team' && canTeamAdmin && <TeamSettings />}
      {tab === 'organization' && canTeamAdmin && <OrgSettings />}
      {tab === 'integrations' && canTeamAdmin && (
        <div className="space-y-6">
          <ApolloSettings />
          <McpKeysSettings />
        </div>
      )}
      {tab === 'texting' && <TextingSettings />}
      {tab === 'plan' && <PlanSettings />}

      {tab === 'account' && (
      <>
      {/*
        Company Apollo BYOK — tenant-wide people search key.
        Team admins save; every user in the tenant uses it (Fill job, AI tools, etc.).
        Also on Integrations tab for admins.
      */}
      <div id="apollo-company-key" className="scroll-mt-6">
        <ApolloSettings />
      </div>

      {/* AI Providers — chat model BYOK (personal keys, not tenant-wide) */}
      <Card className="border-blue-100 shadow-sm dark:border-blue-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            AI Providers
          </CardTitle>
          <CardDescription className="dark:text-slate-300">
            Choose Platform Bedrock (default), or bring your own Anthropic, OpenAI,
            Gemini, or Grok keys. Keys are encrypted and only used for your chat sessions.
            For people search (Apollo), use the company key section above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading saved keys…
            </div>
          )}

          {/* Provider cards — always visible */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <button
              type="button"
              onClick={() => setAiProvider('bedrock')}
              className={`text-left rounded-xl border p-4 transition-all ${
                (aiStatus?.preferredProvider || 'bedrock') === 'bedrock'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950/60 dark:ring-blue-900 dark:text-blue-50'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500 dark:bg-slate-900/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Cloud className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                <span className="font-semibold text-sm text-foreground">Platform</span>
                {(aiStatus?.preferredProvider || 'bedrock') === 'bedrock' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full dark:text-blue-100 dark:bg-blue-900">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed dark:text-slate-300">
                AWS Bedrock Claude. No personal key required.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!aiStatus?.hasAnthropicKey) {
                  toast.message('Paste and save an Anthropic key below first');
                  document.getElementById('anthropic-key')?.focus();
                  document
                    .getElementById('anthropic-key-section')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  return;
                }
                setAiProvider('anthropic');
              }}
              className={`text-left rounded-xl border p-4 transition-all ${
                aiStatus?.preferredProvider === 'anthropic'
                  ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100 dark:bg-violet-950/60 dark:ring-violet-900'
                  : 'border-violet-200 hover:border-violet-400 bg-white dark:border-violet-800 dark:bg-slate-900/40 dark:hover:border-violet-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <span className="font-semibold text-sm text-foreground">Anthropic</span>
                {aiStatus?.preferredProvider === 'anthropic' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full dark:text-violet-100 dark:bg-violet-900">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed dark:text-slate-300">
                Your Claude API key (BYOK).
              </p>
              {aiStatus?.hasAnthropicKey ? (
                <p className="text-[11px] text-violet-700 mt-2 font-mono truncate dark:text-violet-300">
                  {aiStatus.anthropicKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-violet-700 mt-2 font-medium dark:text-violet-300">
                  Add key below ↓
                </p>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!aiStatus?.hasOpenaiKey) {
                  toast.message('Paste and save an OpenAI key below first');
                  document.getElementById('openai-key')?.focus();
                  document
                    .getElementById('openai-key-section')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  return;
                }
                setAiProvider('openai');
              }}
              className={`text-left rounded-xl border p-4 transition-all ${
                aiStatus?.preferredProvider === 'openai'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100 dark:bg-emerald-950/60 dark:ring-emerald-900'
                  : 'border-emerald-200 hover:border-emerald-400 bg-white dark:border-emerald-800 dark:bg-slate-900/40 dark:hover:border-emerald-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-sm text-foreground">OpenAI</span>
                {aiStatus?.preferredProvider === 'openai' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full dark:text-emerald-100 dark:bg-emerald-900">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed dark:text-slate-300">
                Your OpenAI API key (BYOK).
              </p>
              {aiStatus?.hasOpenaiKey ? (
                <p className="text-[11px] text-emerald-700 mt-2 font-mono truncate dark:text-emerald-300">
                  {aiStatus.openaiKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-emerald-700 mt-2 font-medium dark:text-emerald-300">
                  Add key below ↓
                </p>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!aiStatus?.hasGeminiKey) {
                  toast.message('Paste and save a Gemini key below first');
                  document.getElementById('gemini-key')?.focus();
                  document
                    .getElementById('gemini-key-section')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  return;
                }
                setAiProvider('gemini');
              }}
              className={`text-left rounded-xl border p-4 transition-all ${
                aiStatus?.preferredProvider === 'gemini'
                  ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100 dark:bg-sky-950/60 dark:ring-sky-900'
                  : 'border-sky-200 hover:border-sky-400 bg-white dark:border-sky-800 dark:bg-slate-900/40 dark:hover:border-sky-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span className="font-semibold text-sm text-foreground">Gemini</span>
                {aiStatus?.preferredProvider === 'gemini' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full dark:text-sky-100 dark:bg-sky-900">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed dark:text-slate-300">
                Your Google AI Studio key (BYOK).
              </p>
              {aiStatus?.hasGeminiKey ? (
                <p className="text-[11px] text-sky-700 mt-2 font-mono truncate dark:text-sky-300">
                  {aiStatus.geminiKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-sky-700 mt-2 font-medium dark:text-sky-300">
                  Add key below ↓
                </p>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!aiStatus?.hasGrokKey) {
                  toast.message('Paste and save a Grok key in the section below first');
                  document.getElementById('grok-key')?.focus();
                  return;
                }
                setAiProvider('grok');
              }}
              className={`text-left rounded-xl border p-4 transition-all ${
                aiStatus?.preferredProvider === 'grok'
                  ? 'border-zinc-500 bg-zinc-100 ring-2 ring-zinc-300 dark:border-zinc-400 dark:bg-zinc-900 dark:ring-zinc-700'
                  : 'border-zinc-300 hover:border-zinc-500 bg-white dark:border-zinc-600 dark:bg-slate-900/40 dark:hover:border-zinc-400'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-zinc-900 dark:text-zinc-200" />
                <span className="font-semibold text-sm text-foreground">Grok (xAI)</span>
                {aiStatus?.preferredProvider === 'grok' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-zinc-900 bg-zinc-200 px-2 py-0.5 rounded-full dark:text-zinc-100 dark:bg-zinc-700">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed dark:text-slate-300">
                Your xAI API key (BYOK).
              </p>
              {aiStatus?.hasGrokKey ? (
                <p className="text-[11px] text-zinc-800 mt-2 font-mono truncate dark:text-zinc-200">
                  {aiStatus.grokKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-amber-700 mt-2 font-medium dark:text-amber-300">
                  Add key below ↓
                </p>
              )}
            </button>
          </div>

          {/* Anthropic key entry — match Grok BYOK card style */}
          <div
            id="anthropic-key-section"
            className="rounded-xl border-2 border-violet-500/25 p-4 space-y-3 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-violet-700 dark:text-violet-300" />
              <Label htmlFor="anthropic-key" className="text-sm font-semibold text-foreground">
                Anthropic API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-800 bg-violet-200/80 px-2 py-0.5 rounded-full dark:text-violet-100 dark:bg-violet-900">
                BYOK
              </span>
              {aiStatus?.hasAnthropicKey && (
                <span className="ml-auto text-[10px] font-mono text-violet-800 truncate max-w-[40%] dark:text-violet-200">
                  {aiStatus.anthropicKeyHint}
                </span>
              )}
            </div>
            <Input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-api03-…"
              value={anthropicKeyInput}
              onChange={(e) => setAnthropicKeyInput(e.target.value)}
              className="font-mono text-sm bg-white border-violet-200 text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:border-violet-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <p className="text-[11px] text-muted-foreground dark:text-slate-300">
              Create a key at{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-sky-300"
              >
                console.anthropic.com
              </a>
              . Encrypted at rest; never shown in full again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveProviderKey('anthropic')}
                disabled={aiSaving !== null || !anthropicKeyInput.trim()}
                className="rounded-lg bg-violet-700 hover:bg-violet-800"
              >
                {aiSaving === 'anthropic' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {aiStatus?.hasAnthropicKey
                  ? 'Replace Anthropic key'
                  : 'Save Anthropic key'}
              </Button>
              {aiStatus?.hasAnthropicKey && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeProviderKey('anthropic')}
                  disabled={aiRemoving !== null}
                  className="rounded-lg text-red-600"
                >
                  {aiRemoving === 'anthropic' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Remove'
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* OpenAI key entry */}
          <div
            id="openai-key-section"
            className="rounded-xl border-2 border-emerald-500/25 p-4 space-y-3 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              <Label htmlFor="openai-key" className="text-sm font-semibold text-foreground">
                OpenAI API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full dark:text-emerald-100 dark:bg-emerald-900">
                BYOK
              </span>
              {aiStatus?.hasOpenaiKey && (
                <span className="ml-auto text-[10px] font-mono text-emerald-800 truncate max-w-[40%] dark:text-emerald-200">
                  {aiStatus.openaiKeyHint}
                </span>
              )}
            </div>
            <Input
              id="openai-key"
              type="password"
              autoComplete="off"
              placeholder="sk-…"
              value={openaiKeyInput}
              onChange={(e) => setOpenaiKeyInput(e.target.value)}
              className="font-mono text-sm bg-white border-emerald-200 text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:border-emerald-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <p className="text-[11px] text-muted-foreground dark:text-slate-300">
              Create a key at{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-sky-300"
              >
                platform.openai.com/api-keys
              </a>
              . Encrypted at rest; never shown in full again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveProviderKey('openai')}
                disabled={aiSaving !== null || !openaiKeyInput.trim()}
                className="rounded-lg bg-emerald-700 hover:bg-emerald-800"
              >
                {aiSaving === 'openai' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {aiStatus?.hasOpenaiKey ? 'Replace OpenAI key' : 'Save OpenAI key'}
              </Button>
              {aiStatus?.hasOpenaiKey && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeProviderKey('openai')}
                  disabled={aiRemoving !== null}
                  className="rounded-lg text-red-600"
                >
                  {aiRemoving === 'openai' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Remove'
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Gemini key entry */}
          <div
            id="gemini-key-section"
            className="rounded-xl border-2 border-sky-500/25 p-4 space-y-3 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/40"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-sky-700 dark:text-sky-300" />
              <Label htmlFor="gemini-key" className="text-sm font-semibold text-foreground">
                Google Gemini API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-200/80 px-2 py-0.5 rounded-full dark:text-sky-100 dark:bg-sky-900">
                BYOK
              </span>
              {aiStatus?.hasGeminiKey && (
                <span className="ml-auto text-[10px] font-mono text-sky-800 truncate max-w-[40%] dark:text-sky-200">
                  {aiStatus.geminiKeyHint}
                </span>
              )}
            </div>
            <Input
              id="gemini-key"
              type="password"
              autoComplete="off"
              placeholder="AIza…"
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              className="font-mono text-sm bg-white border-sky-200 text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:border-sky-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <p className="text-[11px] text-muted-foreground dark:text-slate-300">
              Create a key at{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-sky-300"
              >
                aistudio.google.com/apikey
              </a>
              . Encrypted at rest; never shown in full again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveProviderKey('gemini')}
                disabled={aiSaving !== null || !geminiKeyInput.trim()}
                className="rounded-lg bg-sky-700 hover:bg-sky-800"
              >
                {aiSaving === 'gemini' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {aiStatus?.hasGeminiKey ? 'Replace Gemini key' : 'Save Gemini key'}
              </Button>
              {aiStatus?.hasGeminiKey && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeProviderKey('gemini')}
                  disabled={aiRemoving !== null}
                  className="rounded-lg text-red-600"
                >
                  {aiRemoving === 'gemini' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Remove'
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Grok key entry — highly visible */}
          <div
            id="grok-key-section"
            className="rounded-xl border-2 border-zinc-900/20 p-4 space-y-3 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/60"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-zinc-900 dark:text-zinc-200" />
              <Label htmlFor="grok-key" className="text-sm font-semibold text-foreground">
                Grok (xAI) API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 bg-zinc-200 px-2 py-0.5 rounded-full dark:text-zinc-100 dark:bg-zinc-700">
                BYOK
              </span>
            </div>
            <Input
              id="grok-key"
              type="password"
              autoComplete="off"
              placeholder="xai-…"
              value={grokKeyInput}
              onChange={(e) => setGrokKeyInput(e.target.value)}
              className="font-mono text-sm bg-white border-zinc-300 text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:border-zinc-600 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <p className="text-[11px] text-muted-foreground dark:text-slate-300">
              Create a key at{' '}
              <a
                href="https://console.x.ai/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-sky-300"
              >
                console.x.ai
              </a>
              . Encrypted at rest; never shown in full again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveProviderKey('grok')}
                disabled={aiSaving !== null || !grokKeyInput.trim()}
                className="rounded-lg bg-zinc-900 hover:bg-zinc-800"
              >
                {aiSaving === 'grok' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {aiStatus?.hasGrokKey ? 'Replace Grok key' : 'Save Grok key'}
              </Button>
              {aiStatus?.hasGrokKey && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeProviderKey('grok')}
                  disabled={aiRemoving !== null}
                  className="rounded-lg text-red-600"
                >
                  {aiRemoving === 'grok' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Remove'
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Email Connections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Connections
          </CardTitle>
          <CardDescription>
            Connect your email to send and receive messages directly from Trio Recruiting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Gmail */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-red-600 font-bold">G</span>
              </div>
              <div>
                <p className="font-medium">Gmail</p>
                {isGmailConnected ? (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Connected: {activeConnections.find(c => c.provider === 'gmail')?.emailAddress}
                  </p>
                ) : gmailConnection?.status === 'revoked' ? (
                  <p className="text-sm text-yellow-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Connection revoked
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {isGmailConnected ? (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => testConnection('gmail')}
                    disabled={testing === 'gmail'}
                  >
                    {testing === 'gmail' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => disconnectEmail('gmail')}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={connectGmail}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect Gmail
                </Button>
              )}
            </div>
          </div>
          
          {/* Outlook */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold">O</span>
              </div>
              <div>
                <p className="font-medium">Outlook</p>
                {isOutlookConnected ? (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Connected: {activeConnections.find(c => c.provider === 'outlook')?.emailAddress}
                  </p>
                ) : outlookConnection?.status === 'revoked' ? (
                  <p className="text-sm text-yellow-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Connection revoked
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {isOutlookConnected ? (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => testConnection('outlook')}
                    disabled={testing === 'outlook'}
                  >
                    {testing === 'outlook' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => disconnectEmail('outlook')}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={connectOutlook}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect Outlook
                </Button>
              )}
            </div>
          </div>
          
          {/* Info */}
          <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
            <p><strong>Note:</strong> Your email credentials are securely stored and never shared. 
            We use OAuth to access your email account - you can revoke access at any time.</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Account Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Manage your account information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue="demo@example.com" disabled />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" defaultValue="Demo User" />
          </div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>
      
      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Configure your notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Notification settings coming soon.
          </p>
        </CardContent>
      </Card>
      
      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Manage your password and security settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Security settings coming soon.
          </p>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
