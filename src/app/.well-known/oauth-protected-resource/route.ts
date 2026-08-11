import { NextResponse } from 'next/server';
import { oauthAppUrl, oauthMcpResource } from '@/lib/mcp/oauth';

export async function GET() {
  return NextResponse.json({
    resource: oauthMcpResource(),
    authorization_servers: [oauthAppUrl()],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
  });
}
