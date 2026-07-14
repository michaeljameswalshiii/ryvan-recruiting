/**
 * Dashboard Settings Page
 * User settings and preferences including email connections
 * 
 * @clientOnly
 */

'use client';

import { useState, useEffect, use } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

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

type AiProvider = 'bedrock' | 'anthropic';

interface AiCredStatus {
  preferredProvider: AiProvider;
  hasAnthropicKey: boolean;
  anthropicKeyHint?: string;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [activeConnections, setActiveConnections] = useState<ActiveConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  
  // Check if OAuth is configured (these would come from env vars on the server side)
  // For client-side, we check via the API response
  const [gmailConfigured, setGmailConfigured] = useState<boolean | null>(null);
  const [outlookConfigured, setOutlookConfigured] = useState<boolean | null>(null);

  // AI BYOK
  const [aiStatus, setAiStatus] = useState<AiCredStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const [aiRemoving, setAiRemoving] = useState(false);
  
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
  
  const fetchAiCredentials = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/credentials');
      if (res.ok) {
        const data = await res.json();
        setAiStatus({
          preferredProvider: data.preferredProvider || 'bedrock',
          hasAnthropicKey: !!data.hasAnthropicKey,
          anthropicKeyHint: data.anthropicKeyHint,
        });
      }
    } catch (err) {
      console.error('Failed to load AI credentials', err);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    checkOAuthConfig();
    fetchAiCredentials();
  }, [userId]);

  const saveAnthropicKey = async () => {
    if (!anthropicKeyInput.trim()) {
      toast.error('Paste your Anthropic API key first');
      return;
    }
    setAiSaving(true);
    try {
      const res = await fetch('/api/ai/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: anthropicKeyInput.trim(),
          setAsPreferred: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save key');
        return;
      }
      toast.success('Anthropic key saved and validated');
      setAnthropicKeyInput('');
      setAiStatus({
        preferredProvider: data.preferredProvider || 'anthropic',
        hasAnthropicKey: true,
        anthropicKeyHint: data.anthropicKeyHint,
      });
    } catch {
      toast.error('Failed to save Anthropic key');
    } finally {
      setAiSaving(false);
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
      setAiStatus((prev) => ({
        preferredProvider: data.preferredProvider || preferredProvider,
        hasAnthropicKey: data.hasAnthropicKey ?? prev?.hasAnthropicKey ?? false,
        anthropicKeyHint: data.anthropicKeyHint ?? prev?.anthropicKeyHint,
      }));
      toast.success(
        preferredProvider === 'bedrock'
          ? 'Using Platform Bedrock'
          : 'Using your Anthropic key'
      );
    } catch {
      toast.error('Failed to update provider');
    }
  };

  const removeAnthropicKey = async () => {
    if (!confirm('Remove your saved Anthropic API key?')) return;
    setAiRemoving(true);
    try {
      const res = await fetch('/api/ai/credentials', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove key');
        return;
      }
      toast.success('Anthropic key removed');
      setAiStatus({
        preferredProvider: 'bedrock',
        hasAnthropicKey: false,
      });
    } catch {
      toast.error('Failed to remove key');
    } finally {
      setAiRemoving(false);
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
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences
        </p>
      </div>
      
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
      
      {/* AI Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            AI Providers
          </CardTitle>
          <CardDescription>
            Platform Claude via AWS Bedrock is always available. Optionally add your own
            Anthropic API key (BYOK) — billed to your Anthropic account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading AI settings…
            </div>
          ) : (
            <>
              {/* Provider cards */}
              <div className="grid gap-3 sm:grid-cols-2">
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
                    <span className="font-semibold text-sm">Platform (Bedrock)</span>
                    {(aiStatus?.preferredProvider || 'bedrock') === 'bedrock' && (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Uses Trio’s AWS Bedrock Claude. No personal key required. Same tools
                    (Apollo, web search, internal data).
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
                    <span className="font-semibold text-sm">My Anthropic key</span>
                    {aiStatus?.preferredProvider === 'anthropic' && (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Bring your own Anthropic API key. Usage is billed to you. Same agent
                    tools as platform mode.
                  </p>
                  {aiStatus?.hasAnthropicKey && (
                    <p className="text-[11px] text-violet-700 mt-2 font-mono">
                      Saved: {aiStatus.anthropicKeyHint}
                    </p>
                  )}
                </button>
              </div>

              {/* Key entry */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
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
                  Get a key from{' '}
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    console.anthropic.com
                  </a>
                  . Keys are encrypted at rest and never shown again in full.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={saveAnthropicKey}
                    disabled={aiSaving || !anthropicKeyInput.trim()}
                    className="rounded-lg"
                  >
                    {aiSaving ? (
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
                      onClick={removeAnthropicKey}
                      disabled={aiRemoving}
                      className="rounded-lg text-red-600"
                    >
                      {aiRemoving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Remove key'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
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
    </div>
  );
}
