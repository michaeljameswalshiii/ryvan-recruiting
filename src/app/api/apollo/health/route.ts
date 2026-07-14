import { checkApolloHealth, isApolloConfigured } from '@/lib/apollo/client';

export async function GET() {
  if (!isApolloConfigured()) {
    return Response.json({
      connected: false,
      message: 'APOLLO_API_KEY not configured',
    });
  }

  const health = await checkApolloHealth();
  return Response.json(health);
}
