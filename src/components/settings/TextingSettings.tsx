'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare,
  Loader2,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';

type SmsConfig = {
  enabled: boolean;
  businessName: string;
  signature: string;
  appendOptOutNotice: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  defaultTimezone: string;
  defaultCountry: 'US' | 'CA';
  originationIdentity?: string;
  configurationSetName?: string;
  allowColdOutreach: boolean;
  requireConsent: boolean;
  dailySendLimit: number;
};

type ProviderStatus = {
  mode: string;
  region: string;
  hasCredentials: boolean;
  envOrigination?: string;
  note: string;
};

export function TextingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [sentToday, setSentToday] = useState(0);
  const [originationEffective, setOriginationEffective] = useState<string | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sms/config', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setConfig(data.config);
      setProvider(data.provider);
      setSentToday(data.sentToday || 0);
      setOriginationEffective(data.originationEffective);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load texting settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch?: Partial<SmsConfig>) => {
    if (!config) return;
    setSaving(true);
    try {
      const body = { ...config, ...patch };
      const res = await fetch('/api/sms/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setConfig(data.config);
      setProvider(data.provider);
      setSentToday(data.sentToday || 0);
      setOriginationEffective(data.originationEffective);
      toast.success('Texting settings saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading texting…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" />
            Texting (SMS)
          </CardTitle>
          <CardDescription>
            AWS End User Messaging SMS with built-in compliance: consent,
            STOP/START/HELP, quiet hours, daily limits, and opt-out notices.
            Not legal advice — confirm practices with counsel for your use
            cases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium">
              {provider?.mode === 'aws' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              Provider: {provider?.mode || 'unknown'}
              {provider?.region ? ` · ${provider.region}` : ''}
            </div>
            <p className="text-muted-foreground text-xs">{provider?.note}</p>
            <p className="text-xs text-muted-foreground">
              Effective from number:{' '}
              <code className="text-foreground">
                {originationEffective || 'not set'}
              </code>
              {' · '}
              Sent today: {sentToday} / {config.dailySendLimit}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) =>
                setConfig((c) => (c ? { ...c, enabled: e.target.checked } : c))
              }
            />
            Enable texting for this workspace
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Business / agency name</Label>
              <Input
                value={config.businessName}
                onChange={(e) =>
                  setConfig((c) =>
                    c ? { ...c, businessName: e.target.value } : c
                  )
                }
                placeholder="Ryvan Recruiting"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Prepended on first messages for identification
              </p>
            </div>
            <div>
              <Label>Origination number (E.164)</Label>
              <Input
                value={config.originationIdentity || ''}
                onChange={(e) =>
                  setConfig((c) =>
                    c
                      ? { ...c, originationIdentity: e.target.value }
                      : c
                  )
                }
                placeholder="+15551234567"
              />
              <p className="text-xs text-muted-foreground mt-1">
                From AWS End User Messaging console (or env
                AWS_SMS_ORIGINATION_NUMBER)
              </p>
            </div>
            <div>
              <Label>Opt-out signature</Label>
              <Input
                value={config.signature}
                onChange={(e) =>
                  setConfig((c) =>
                    c ? { ...c, signature: e.target.value } : c
                  )
                }
              />
            </div>
            <div>
              <Label>Configuration set (optional)</Label>
              <Input
                value={config.configurationSetName || ''}
                onChange={(e) =>
                  setConfig((c) =>
                    c
                      ? { ...c, configurationSetName: e.target.value }
                      : c
                  )
                }
                placeholder="trio-sms-events"
              />
            </div>
            <div>
              <Label>Default timezone</Label>
              <Input
                value={config.defaultTimezone}
                onChange={(e) =>
                  setConfig((c) =>
                    c ? { ...c, defaultTimezone: e.target.value } : c
                  )
                }
              />
            </div>
            <div>
              <Label>Daily send limit</Label>
              <Input
                type="number"
                value={config.dailySendLimit}
                onChange={(e) =>
                  setConfig((c) =>
                    c
                      ? { ...c, dailySendLimit: Number(e.target.value) }
                      : c
                  )
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.appendOptOutNotice}
                onChange={(e) =>
                  setConfig((c) =>
                    c
                      ? { ...c, appendOptOutNotice: e.target.checked }
                      : c
                  )
                }
              />
              Append STOP notice on outbound
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.requireConsent}
                onChange={(e) =>
                  setConfig((c) =>
                    c ? { ...c, requireConsent: e.target.checked } : c
                  )
                }
              />
              Require recorded consent before send
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.allowColdOutreach}
                onChange={(e) =>
                  setConfig((c) =>
                    c ? { ...c, allowColdOutreach: e.target.checked } : c
                  )
                }
              />
              Allow cold outreach (not recommended)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.quietHoursEnabled}
                onChange={(e) =>
                  setConfig((c) =>
                    c
                      ? { ...c, quietHoursEnabled: e.target.checked }
                      : c
                  )
                }
              />
              Enforce quiet hours
            </label>
          </div>

          {config.quietHoursEnabled && (
            <div className="flex items-center gap-3 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs">Quiet start</Label>
                <Input
                  type="time"
                  className="w-32"
                  value={config.quietHoursStart}
                  onChange={(e) =>
                    setConfig((c) =>
                      c
                        ? { ...c, quietHoursStart: e.target.value }
                        : c
                    )
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Quiet end</Label>
                <Input
                  type="time"
                  className="w-32"
                  value={config.quietHoursEnd}
                  onChange={(e) =>
                    setConfig((c) =>
                      c ? { ...c, quietHoursEnd: e.target.value } : c
                    )
                  }
                />
              </div>
            </div>
          )}

          <Button onClick={() => save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save texting settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Compliance checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">1.</strong> Register your brand /
            campaign in AWS End User Messaging for US 10DLC before production
            volume.
          </p>
          <p>
            <strong className="text-foreground">2.</strong> Only text numbers you
            have a lawful basis for (applicants, prior relationship, written
            consent). Record opt-in on each candidate.
          </p>
          <p>
            <strong className="text-foreground">3.</strong> STOP / START / HELP
            are auto-handled on inbound webhook (
            <code className="text-xs">/api/public/sms/inbound</code>).
          </p>
          <p>
            <strong className="text-foreground">4.</strong> Quiet hours default
            9pm–8am workspace timezone.
          </p>
          <p className="flex items-start gap-2">
            <Phone className="h-4 w-4 mt-0.5 shrink-0" />
            Full setup steps: see <code>docs/SMS_SETUP.md</code> in the repo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
