/**
 * Bedrock Usage Dashboard
 * Shows AI usage stats, tokens, cost, and recent activity
 * 
 * @serverOnly - Data fetched server-side
 */

import { getBedrockUsageSummary, getUsageByUser, getUsageByModel, getRecentCalls } from '@/lib/aws/athena-bedrock';
import { DollarSign, Activity, Cpu, Clock, TrendingUp, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Format number with K/M suffix
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format currency
 */
function formatCurrency(num: number): string {
  if (num < 0.01) return '<$0.01';
  return `$${num.toFixed(2)}`;
}

/**
 * Format date/time
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

export default async function UsageDashboardPage() {
  // Fetch all data server-side
  const [summary, byUser, byModel, recentCalls] = await Promise.all([
    getBedrockUsageSummary('week'),
    getUsageByUser('week'),
    getUsageByModel('week'),
    getRecentCalls('day'),
  ]);

  const dailySummary = await getBedrockUsageSummary('day');
  const monthlySummary = await getBedrockUsageSummary('month');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Usage Dashboard</h1>
          <p className="text-muted-foreground">
            Track Claude AI usage, tokens, and costs
          </p>
        </div>
        <a 
          href="https://console.aws.amazon.com/bedrock/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Badge variant="outline" className="gap-2">
            <BarChart3 className="h-3 w-3" />
            View in QuickSight
          </Badge>
        </a>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Today's Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(dailySummary.totalTokens)} tokens</div>
            <p className="text-xs text-muted-foreground">
              {dailySummary.totalInvocations} calls
            </p>
          </CardContent>
        </Card>

        {/* This Week */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary.totalTokens)} tokens</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary.estimatedCost)} est. cost
            </p>
          </CardContent>
        </Card>

        {/* This Month */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(monthlySummary.totalTokens)} tokens</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(monthlySummary.estimatedCost)} est. cost
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Spend</CardTitle>
          <CardDescription>Estimated cost for this billing period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sonnet 4.6</span>
              <span className="font-medium">{formatCurrency(monthlySummary.estimatedCost)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full"
                style={{ 
                  width: `${Math.min((monthlySummary.estimatedCost / 100) * 100, 100)}%` 
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            $100/month budget (Claude Sonnet 4.6 pricing)
          </p>
        </CardContent>
      </Card>

      {/* Usage by Model */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            {byModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded yet</p>
            ) : (
              <div className="space-y-4">
                {byModel.map((model) => (
                  <div key={model.modelId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate max-w-[200px]">
                        {model.modelId.split('.').pop()}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{model.invocations}</div>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(model.totalTokens)} tokens
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage by User</CardTitle>
          </CardHeader>
          <CardContent>
            {byUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded yet</p>
            ) : (
              <div className="space-y-4">
                {byUser.slice(0, 5).map((user) => (
                  <div key={user.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {user.userEmail?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <span className="text-sm truncate max-w-[150px]">
                        {user.userEmail}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{user.invocations} calls</div>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(user.estimatedCost)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 20 AI calls</CardDescription>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <div className="space-y-4">
              {recentCalls.map((call) => (
                <div key={call.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {call.queryPreview || 'AI Request'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.modelId.split('.').pop()} • {formatTime(call.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">
                      {formatNumber(call.inputTokens + call.outputTokens)} tokens
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(call.estimatedCost)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
