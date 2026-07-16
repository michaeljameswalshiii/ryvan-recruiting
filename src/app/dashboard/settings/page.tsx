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

type AiProvider = 'bedrock' | 'anthropic' | 'grok';

interface AiCredStatus {
  preferredProvider: AiProvider;
  hasAnthropicKey: boolean;
  anthropicKeyHint?: string;
  hasGrokKey: boolean;
  grokKeyHint?: string;
}

type SettingsTab = 'account' | 'team' | 'organization' | 'plan';

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
  const [grokKeyInput, setGrokKeyInput] = useState('');
  const [aiSaving, setAiSaving] = useState<'anthropic' | 'grok' | null>(null);
  const [aiRemoving, setAiRemoving] = useState<'anthropic' | 'grok' | null>(null);
  
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
  
  // Check if OAuth is configured
  const checkOAuthConfig = async () => {
    try {
      // Try to initiate OAuth - it will return an error if not configured
      const gmailResponse = await fetch('/api/email/oauth/gmail?userId=test', { method: 'HEAD' });
      const outlookResponse = await fetch('/api/email/oauth/outlook?userId=test', { method: 'HEAD' });
      
      // If we get 400, it's because userId is required (so it's configured)
      // If we get 503, it's not configured
      setGmailConfigured(gmailResponse.status !== 503);
      setOutlookConfigured(outlookResponse.status !== 503);
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
  
  const mapAiStatus = (data: any, prev?: AiCredStatus | null): AiCredStatus => ({
    preferredProvider: data.preferredProvider || prev?.preferredProvider || 'bedrock',
    hasAnthropicKey: data.hasAnthropicKey ?? prev?.hasAnthropicKey ?? false,
    anthropicKeyHint: data.anthropicKeyHint ?? prev?.anthropicKeyHint,
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
        setAiStatus({
          preferredProvider: 'bedrock',
          hasAnthropicKey: false,
          hasGrokKey: false,
        });
        if (res.status === 401) {
          console.warn('[settings] AI credentials: not signed in');
        }
      }
    } catch (err) {
      console.error('Failed to load AI credentials', err);
      setAiStatus({
        preferredProvider: 'bedrock',
        hasAnthropicKey: false,
        hasGrokKey: false,
      });
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

  const saveProviderKey = async (keyProvider: 'anthropic' | 'grok') => {
    const value = keyProvider === 'anthropic' ? anthropicKeyInput : grokKeyInput;
    if (!value.trim()) {
      toast.error(
        keyProvider === 'anthropic'
          ? 'Paste your Anthropic API key first'
          : 'Paste your Grok (xAI) API key first'
      );
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
      toast.success(
        keyProvider === 'anthropic'
          ? 'Anthropic key saved and validated'
          : 'Grok key saved and validated'
      );
      if (keyProvider === 'anthropic') setAnthropicKeyInput('');
      else setGrokKeyInput('');
      setAiStatus(mapAiStatus(data));
    } catch {
      toast.error(
        keyProvider === 'anthropic'
          ? 'Failed to save Anthropic key'
          : 'Failed to save Grok key'
      );
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
      toast.success(
        preferredProvider === 'bedrock'
          ? 'Using Platform Bedrock'
          : preferredProvider === 'anthropic'
            ? 'Using your Anthropic key'
            : 'Using your Grok key'
      );
    } catch {
      toast.error('Failed to update provider');
    }
  };

  const removeProviderKey = async (keyProvider: 'anthropic' | 'grok') => {
    if (
      !confirm(
        keyProvider === 'anthropic'
          ? 'Remove your saved Anthropic API key?'
          : 'Remove your saved Grok/xAI API key?'
      )
    )
      return;
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
      toast.success(
        keyProvider === 'anthropic' ? 'Anthropic key removed' : 'Grok key removed'
      );
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
          subject: 'Test Email - Turnkey ATS',
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
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'team' && canTeamAdmin && <TeamSettings />}
      {tab === 'organization' && canTeamAdmin && <OrgSettings />}
      {tab === 'plan' && <PlanSettings />}

      {tab === 'account' && (
      <>
      {/* AI Providers — top of page so BYOK keys are easy to find */}
      <Card className="border-blue-100 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            AI Providers
          </CardTitle>
          <CardDescription>
            Choose Platform Bedrock (default), or bring your own Anthropic / Grok keys.
            Keys are encrypted and only used for your chat sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading saved keys…
            </div>
          )}

          {/* Provider cards — always visible */}
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setAiProvider('bedrock')}
              className={`text-left rounded-xl border p-4 transition-all ${
                (aiStatus?.preferredProvider || 'bedrock') === 'bedrock'
                  ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Cloud className="h-4 w-4 text-slate-600" />
                <span className="font-semibold text-sm">Platform</span>
                {(aiStatus?.preferredProvider || 'bedrock') === 'bedrock' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AWS Bedrock Claude. No personal key required.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!aiStatus?.hasAnthropicKey) {
                  toast.message('Paste and save an Anthropic key below first');
                  return;
                }
                setAiProvider('anthropic');
              }}
              className={`text-left rounded-xl border p-4 transition-all ${
                aiStatus?.preferredProvider === 'anthropic'
                  ? 'border-violet-500 bg-violet-50/60 ring-2 ring-violet-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="h-4 w-4 text-violet-600" />
                <span className="font-semibold text-sm">Anthropic</span>
                {aiStatus?.preferredProvider === 'anthropic' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your Claude API key (BYOK).
              </p>
              {aiStatus?.hasAnthropicKey ? (
                <p className="text-[11px] text-violet-700 mt-2 font-mono truncate">
                  {aiStatus.anthropicKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-2">No key saved</p>
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
                  ? 'border-zinc-900 bg-zinc-50 ring-2 ring-zinc-300'
                  : 'border-zinc-300 hover:border-zinc-500 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-zinc-900" />
                <span className="font-semibold text-sm">Grok (xAI)</span>
                {aiStatus?.preferredProvider === 'grok' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-zinc-900 bg-zinc-200 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your xAI API key (BYOK).
              </p>
              {aiStatus?.hasGrokKey ? (
                <p className="text-[11px] text-zinc-800 mt-2 font-mono truncate">
                  {aiStatus.grokKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-amber-700 mt-2 font-medium">
                  Add key below ↓
                </p>
              )}
            </button>
          </div>

          {/* Anthropic key entry */}
          <div className="rounded-xl border border-violet-100 p-4 space-y-3 bg-violet-50/30">
            <Label htmlFor="anthropic-key" className="text-sm font-medium">
              Anthropic API key
            </Label>
            <Input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-api03-…"
              value={anthropicKeyInput}
              onChange={(e) => setAnthropicKeyInput(e.target.value)}
              className="font-mono text-sm bg-white"
            />
            <p className="text-[11px] text-muted-foreground">
              From{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveProviderKey('anthropic')}
                disabled={aiSaving !== null || !anthropicKeyInput.trim()}
                className="rounded-lg"
              >
                {aiSaving === 'anthropic' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {aiStatus?.hasAnthropicKey ? 'Replace key' : 'Save & validate'}
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

          {/* Grok key entry — highly visible */}
          <div
            id="grok-key-section"
            className="rounded-xl border-2 border-zinc-900/20 p-4 space-y-3 bg-zinc-50"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-zinc-900" />
              <Label htmlFor="grok-key" className="text-sm font-semibold">
                Grok (xAI) API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 bg-zinc-200 px-2 py-0.5 rounded-full">
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
              className="font-mono text-sm bg-white border-zinc-300"
            />
            <p className="text-[11px] text-muted-foreground">
              Create a key at{' '}
              <a
                href="https://console.x.ai/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
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
            Connect your email to send and receive messages directly from Turnkey ATS
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
