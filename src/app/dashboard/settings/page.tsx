/**
 * Dashboard Settings Page
 * User settings and preferences including email connections
 * 
 * @clientOnly
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
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
  Shield,
  FileText,
  UserRound,
  Settings2,
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
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard';
import { InvoiceTemplatesSettings } from '@/components/settings/InvoiceTemplatesSettings';
import { ProductConfigSettings } from '@/components/settings/ProductConfigSettings';

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
  | 'invoices'
  | 'plan'
  | 'integrations'
  | 'product'
  | 'texting'
  | 'security';

/** Personal vs org-level settings (sidebar: My Settings / Company Settings) */
type SettingsScope = 'my' | 'company';

const MY_TABS: SettingsTab[] = ['account'];
const COMPANY_TABS: SettingsTab[] = [
  'team',
  'organization',
  'invoices',
  'integrations',
  'product',
  'texting',
  'security',
  'plan',
];

export default function SettingsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope: SettingsScope = pathname?.includes('/settings/company')
    ? 'company'
    : 'my';
  const [tab, setTab] = useState<SettingsTab>(
    scope === 'company' ? 'team' : 'account'
  );
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
  
  // Deep-link ?tab=… and keep scope URLs consistent
  useEffect(() => {
    const t = searchParams.get('tab') as SettingsTab | null;
    const valid =
      t === 'account' ||
      t === 'team' ||
      t === 'organization' ||
      t === 'plan' ||
      t === 'integrations' ||
      t === 'texting' ||
      t === 'security' ||
      t === 'invoices';

    if (valid && t) {
      // Old bookmarks: company tabs under /settings → bounce to /settings/company
      if (scope === 'my' && COMPANY_TABS.includes(t)) {
        router.replace(`/dashboard/settings/company?tab=${t}`);
        return;
      }
      // My-only tabs under company → bounce home to My Settings
      if (scope === 'company' && MY_TABS.includes(t)) {
        router.replace(`/dashboard/settings?tab=${t}`);
        return;
      }
      setTab(t);
      return;
    }

    // Default tab when switching scopes
    setTab(scope === 'company' ? 'team' : 'account');
  }, [searchParams, scope, router]);

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
  
  const allTabs: {
    id: SettingsTab;
    label: string;
    icon: React.ReactNode;
    scope: SettingsScope;
    adminOnly?: boolean;
  }[] = [
    {
      id: 'account',
      label: 'Account',
      icon: <UserRound className="h-4 w-4" />,
      scope: 'my',
    },
    {
      id: 'team',
      label: 'Team',
      icon: <Users className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
    {
      id: 'organization',
      label: 'Organization',
      icon: <Building2 className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
    {
      id: 'invoices',
      label: 'Invoices',
      icon: <FileText className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: <Terminal className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
    {
      id: 'product',
      label: 'Product config',
      icon: <Settings2 className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
    {
      id: 'texting',
      label: 'Texting',
      icon: <MessageSquare className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
    {
      id: 'security',
      label: 'Security',
      icon: <Shield className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
    {
      id: 'plan',
      label: 'Plan & billing',
      icon: <CreditCard className="h-4 w-4" />,
      scope: 'company',
      adminOnly: true,
    },
  ];

  const tabs = useMemo(
    () =>
      allTabs.filter(
        (t) =>
          t.scope === scope && (!t.adminOnly || canTeamAdmin || scope === 'my')
      ),
    [scope, canTeamAdmin]
  );

  // Company settings require team admin
  useEffect(() => {
    if (scope === 'company' && userRole !== null && !canTeamAdmin) {
      router.replace('/dashboard/settings');
    }
  }, [scope, userRole, canTeamAdmin, router]);

  const selectTab = (id: SettingsTab) => {
    setTab(id);
    const base =
      scope === 'company'
        ? '/dashboard/settings/company'
        : '/dashboard/settings';
    router.replace(`${base}?tab=${id}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {scope === 'company' ? 'Company Settings' : 'My Settings'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {scope === 'company'
            ? 'Team, organization, integrations, billing, and shared company tools'
            : 'Your email, password, and personal AI preferences'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                : 'text-slate-300 hover:bg-white/10 hover:text-white dark:text-slate-300 border border-transparent'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {scope === 'company' && tab === 'team' && canTeamAdmin && <TeamSettings />}
      {scope === 'company' && tab === 'organization' && canTeamAdmin && (
        <OrgSettings />
      )}
      {scope === 'company' && tab === 'invoices' && canTeamAdmin && (
        <InvoiceTemplatesSettings />
      )}
      {scope === 'company' && tab === 'integrations' && canTeamAdmin && (
        <div className="space-y-6">
          <div id="apollo-company-key" className="scroll-mt-6">
            <ApolloSettings />
          </div>
          <McpKeysSettings />
        </div>
      )}
      {scope === 'company' && tab === 'product' && canTeamAdmin && (
        <ProductConfigSettings />
      )}
      {scope === 'company' && tab === 'texting' && canTeamAdmin && (
        <TextingSettings />
      )}
      {scope === 'company' && tab === 'security' && canTeamAdmin && (
        <SecuritySettings />
      )}
      {scope === 'company' && tab === 'plan' && canTeamAdmin && <PlanSettings />}

      {scope === 'my' && tab === 'account' && (
      <>
      {/* AI Providers — personal BYOK for chat sessions */}
      <Card
        data-ink-on-light
        className="border-blue-100 bg-white shadow-sm text-slate-900"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Sparkles className="h-5 w-5 text-blue-600" />
            AI Providers
          </CardTitle>
          <CardDescription className="text-slate-600">
            Choose Platform Bedrock (default), or bring your own Anthropic, OpenAI,
            Gemini, or Grok keys. Keys are encrypted and only used for your chat sessions.
            For people search (Apollo), use the company key section above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading saved keys…
            </div>
          )}

          {/* Provider cards — light pastel chips */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <button
              type="button"
              onClick={() => setAiProvider('bedrock')}
              className={`text-left rounded-xl border p-4 transition-all ${
                (aiStatus?.preferredProvider || 'bedrock') === 'bedrock'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100 text-slate-900'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Cloud className="h-4 w-4 text-slate-600" />
                <span className="font-semibold text-sm text-slate-900">Platform</span>
                {(aiStatus?.preferredProvider || 'bedrock') === 'bedrock' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
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
                  ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100 text-slate-900'
                  : 'border-violet-200 bg-white hover:border-violet-400 hover:bg-violet-50/50 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="h-4 w-4 text-violet-600" />
                <span className="font-semibold text-sm text-slate-900">Anthropic</span>
                {aiStatus?.preferredProvider === 'anthropic' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-violet-800 bg-violet-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your Claude API key (BYOK).
              </p>
              {aiStatus?.hasAnthropicKey ? (
                <p className="text-[11px] text-violet-800 mt-2 font-mono truncate">
                  {aiStatus.anthropicKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-violet-700 mt-2 font-medium">
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
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100 text-slate-900'
                  : 'border-emerald-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-sm text-slate-900">OpenAI</span>
                {aiStatus?.preferredProvider === 'openai' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your OpenAI API key (BYOK).
              </p>
              {aiStatus?.hasOpenaiKey ? (
                <p className="text-[11px] text-emerald-800 mt-2 font-mono truncate">
                  {aiStatus.openaiKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-emerald-700 mt-2 font-medium">
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
                  ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100 text-slate-900'
                  : 'border-sky-200 bg-white hover:border-sky-400 hover:bg-sky-50/50 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-sky-600" />
                <span className="font-semibold text-sm text-slate-900">Gemini</span>
                {aiStatus?.preferredProvider === 'gemini' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your Google AI Studio key (BYOK).
              </p>
              {aiStatus?.hasGeminiKey ? (
                <p className="text-[11px] text-sky-800 mt-2 font-mono truncate">
                  {aiStatus.geminiKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-sky-700 mt-2 font-medium">
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
                  ? 'border-slate-400 bg-slate-100 ring-2 ring-slate-200 text-slate-900'
                  : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-slate-700" />
                <span className="font-semibold text-sm text-slate-900">Grok (xAI)</span>
                {aiStatus?.preferredProvider === 'grok' && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-800 bg-slate-200 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your xAI API key (BYOK).
              </p>
              {aiStatus?.hasGrokKey ? (
                <p className="text-[11px] text-slate-800 mt-2 font-mono truncate">
                  {aiStatus.grokKeyHint}
                </p>
              ) : (
                <p className="text-[11px] text-amber-800 mt-2 font-medium">
                  Add key below ↓
                </p>
              )}
            </button>
          </div>

          {/* Anthropic key entry */}
          <div
            id="anthropic-key-section"
            className="rounded-xl border-2 border-violet-200 p-4 space-y-3 bg-violet-50 text-slate-900"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-violet-700" />
              <Label htmlFor="anthropic-key" className="text-sm font-semibold text-slate-900">
                Anthropic API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-900 bg-violet-200 px-2 py-0.5 rounded-full">
                BYOK
              </span>
              {aiStatus?.hasAnthropicKey && (
                <span className="ml-auto text-[10px] font-mono text-violet-900 truncate max-w-[40%]">
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
              className="font-mono text-sm bg-white border-violet-300 text-slate-900 placeholder:text-slate-500"
            />
            <p className="text-[11px] text-slate-600">
              Create a key at{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
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
            className="rounded-xl border-2 border-emerald-200 p-4 space-y-3 bg-emerald-50 text-slate-900"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-700" />
              <Label htmlFor="openai-key" className="text-sm font-semibold text-slate-900">
                OpenAI API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900 bg-emerald-200 px-2 py-0.5 rounded-full">
                BYOK
              </span>
              {aiStatus?.hasOpenaiKey && (
                <span className="ml-auto text-[10px] font-mono text-emerald-900 truncate max-w-[40%]">
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
              className="font-mono text-sm bg-white border-emerald-300 text-slate-900 placeholder:text-slate-500"
            />
            <p className="text-[11px] text-slate-600">
              Create a key at{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
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
            className="rounded-xl border-2 border-sky-200 p-4 space-y-3 bg-sky-50 text-slate-900"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-sky-700" />
              <Label htmlFor="gemini-key" className="text-sm font-semibold text-slate-900">
                Google Gemini API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-900 bg-sky-200 px-2 py-0.5 rounded-full">
                BYOK
              </span>
              {aiStatus?.hasGeminiKey && (
                <span className="ml-auto text-[10px] font-mono text-sky-900 truncate max-w-[40%]">
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
              className="font-mono text-sm bg-white border-sky-300 text-slate-900 placeholder:text-slate-500"
            />
            <p className="text-[11px] text-slate-600">
              Create a key at{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
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

          {/* Grok key entry */}
          <div
            id="grok-key-section"
            className="rounded-xl border-2 border-slate-200 p-4 space-y-3 bg-slate-50 text-slate-900"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-800" />
              <Label htmlFor="grok-key" className="text-sm font-semibold text-slate-900">
                Grok (xAI) API key
              </Label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-800 bg-slate-200 px-2 py-0.5 rounded-full">
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
              className="font-mono text-sm bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
            />
            <p className="text-[11px] text-slate-600">
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
                className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
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
      
      {/* Change password (any signed-in user) */}
      <ChangePasswordCard />
      </>
      )}
    </div>
  );
}
