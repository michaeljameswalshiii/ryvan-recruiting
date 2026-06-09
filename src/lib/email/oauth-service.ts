/**
 * Email OAuth Service
 * Handles OAuth flows for Gmail and Outlook email connections
 * 
 * @serverOnly
 */

import { google, Auth } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { getEmailConnection, saveEmailConnection, updateEmailConnection } from '../db/repositories/email-connection-repository';
import { type EmailProvider, type UserEmailConnection } from '../schemas/email-connection';

// ============================================================================
// Configuration
// ============================================================================

const region = process.env.AWS_REGION || 'us-east-1';

// Gmail OAuth
const gmailClientId = process.env.GMAIL_CLIENT_ID;
const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
const gmailRedirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/email/oauth/gmail/callback';

// Outlook OAuth (Microsoft) 
const outlookClientId = process.env.OUTLOOK_CLIENT_ID;
const outlookClientSecret = process.env.OUTLOOK_CLIENT_SECRET;
const outlookRedirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/api/email/oauth/outlook/callback';

// Scopes
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const OUTLOOK_SCOPES = [
  'Mail.ReadWrite',
  'Mail.Send',
  'offline_access',
  'User.Read',
];

// ============================================================================
// OAuth URL Generators
// ============================================================================

/**
 * Generate Gmail OAuth URL
 */
export function getGmailOAuthUrl(state: string): string {
  const oauth2Client = new google.auth.OAuth2(
    gmailClientId,
    gmailClientSecret,
    gmailRedirectUri
  );
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    state,
    prompt: 'consent', // Force consent to get refresh token
  });
}

/**
 * Generate Outlook OAuth URL
 */
export function getOutlookOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: outlookClientId || '',
    response_type: 'code',
    redirect_uri: outlookRedirectUri,
    scope: OUTLOOK_SCOPES.join(' '),
    state,
    response_mode: 'query',
  });
  
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

// ============================================================================
// Token Exchange
// ============================================================================

/**
 * Exchange Gmail authorization code for tokens
 */
export async function exchangeGmailCode(
  userId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      gmailClientId,
      gmailClientSecret,
      gmailRedirectUri
    );
    
    // Get tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return { success: false, error: 'No refresh token received' };
    }
    
    // Get user email
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const emailAddress = profile.data.emailAddress;
    
    if (!emailAddress) {
      return { success: false, error: 'Could not get email address' };
    }
    
    // Save connection
    await saveEmailConnection({
      userId,
      provider: 'gmail',
      emailAddress,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      tokenType: tokens.token_type || 'Bearer',
      expiresAt: tokens.expiry_date || undefined,
      status: 'active',
    });
    
    return { success: true };
  } catch (error) {
    console.error('[GMAIL] Token exchange failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token exchange failed' 
    };
  }
}

/**
 * Exchange Outlook authorization code for tokens
 */
export async function exchangeOutlookCode(
  userId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({
      client_id: outlookClientId || '',
      client_secret: outlookClientSecret,
      code,
      redirect_uri: outlookRedirectUri,
      grant_type: 'authorization_code',
    });
    
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Token exchange failed: ${error}` };
    }
    
    const tokens = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };
    
    // Get user email from Graph API
    const graphClient = Client.init({
      authProvider: (done) => done(null, tokens.access_token),
    });
    
    const me = await graphClient.api('/me').get();
    const emailAddress = me.mail || me.userPrincipalName;
    
    if (!emailAddress) {
      return { success: false, error: 'Could not get email address' };
    }
    
    // Save connection
    const expiresAt = Date.now() + (tokens.expires_in * 1000);
    
    await saveEmailConnection({
      userId,
      provider: 'outlook',
      emailAddress,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      tokenType: tokens.token_type,
      expiresAt,
      status: 'active',
    });
    
    return { success: true };
  } catch (error) {
    console.error('[OUTLOOK] Token exchange failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token exchange failed' 
    };
  }
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Refresh Gmail access token
 */
export async function refreshGmailToken(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await getEmailConnection(userId, 'gmail');
    
    if (!connection || connection.provider !== 'gmail') {
      return { success: false, error: 'No Gmail connection found' };
    }
    
    const oauth2Client = new google.auth.OAuth2(
      gmailClientId,
      gmailClientSecret,
      gmailRedirectUri
    );
    
    oauth2Client.setCredentials({
      refresh_token: connection.refreshToken,
    });
    
    const { credentials } = await oauth2Client.getAccessToken();
    
    if (!credentials.access_token) {
      return { success: false, error: 'Failed to get access token' };
    }
    
    // Update stored tokens
    await updateEmailConnection(userId, 'gmail', {
      accessToken: credentials.access_token,
      tokenType: credentials.token_type,
      expiresAt: credentials.expiry_date,
    });
    
    return { success: true };
  } catch (error) {
    console.error('[GMAIL] Token refresh failed:', error);
    
    // Mark as error if refresh fails
    await updateEmailConnection(userId, 'gmail', {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Token refresh failed',
    });
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token refresh failed' 
    };
  }
}

/**
 * Refresh Outlook access token
 */
export async function refreshOutlookToken(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await getEmailConnection(userId, 'outlook');
    
    if (!connection || connection.provider !== 'outlook') {
      return { success: false, error: 'No Outlook connection found' };
    }
    
    const params = new URLSearchParams({
      client_id: outlookClientId || '',
      client_secret: outlookClientSecret,
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
      scope: OUTLOOK_SCOPES.join(' '),
    });
    
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorData = await response.json() as { error_description?: string };
      
      // Mark as revoked if refresh token is invalid
      if (response.status === 401 || errorData.error_description?.includes('refresh token')) {
        await updateEmailConnection(userId, 'outlook', {
          status: 'revoked',
          errorMessage: 'Refresh token invalid',
        });
      }
      
      return { success: false, error: errorData.error_description || 'Token refresh failed' };
    }
    
    const tokens = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
    };
    
    // Update stored tokens
    const expiresAt = Date.now() + (tokens.expires_in * 1000);
    
    await updateEmailConnection(userId, 'outlook', {
      accessToken: tokens.access_token,
      tokenType: tokens.token_type,
      expiresAt,
      // Only update refresh token if a new one was issued
      ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
    });
    
    return { success: true };
  } catch (error) {
    console.error('[OUTLOOK] Token refresh failed:', error);
    
    await updateEmailConnection(userId, 'outlook', {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Token refresh failed',
    });
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token refresh failed' 
    };
  }
}

// ============================================================================
// Get Authenticated Clients
// ============================================================================

/**
 * Get authenticated Gmail client for user
 */
export async function getGmailClient(
  userId: string
): Promise<{ oauth2Client: Auth.OAuth2Client; emailAddress: string } | null> {
  const connection = await getEmailConnection(userId, 'gmail');
  
  if (!connection) {
    return null;
  }
  
  // Check if token needs refresh
  if (connection.expiresAt && connection.expiresAt < Date.now() + 60000) {
    await refreshGmailToken(userId);
  }
  
  const updatedConnection = await getEmailConnection(userId, 'gmail');
  
  if (!updatedConnection || !updatedConnection.accessToken) {
    return null;
  }
  
  const oauth2Client = new google.auth.OAuth2(
    gmailClientId,
    gmailClientSecret,
    gmailRedirectUri
  );
  
  oauth2Client.setCredentials({
    access_token: updatedConnection.accessToken,
    refresh_token: updatedConnection.refreshToken,
    token_type: updatedConnection.tokenType,
    expiry_date: updatedConnection.expiresAt,
  });
  
  return {
    oauth2Client,
    emailAddress: updatedConnection.emailAddress,
  };
}

/**
 * Get authenticated Microsoft Graph client for user
 */
export async function getOutlookClient(
  userId: string
): Promise<{ graphClient: Client; emailAddress: string } | null> {
  const connection = await getEmailConnection(userId, 'outlook');
  
  if (!connection) {
    return null;
  }
  
  // Check if token needs refresh
  if (connection.expiresAt && connection.expiresAt < Date.now() + 60000) {
    await refreshOutlookToken(userId);
  }
  
  const updatedConnection = await getEmailConnection(userId, 'outlook');
  
  if (!updatedConnection || !updatedConnection.accessToken) {
    return null;
  }
  
  const graphClient = Client.init({
    authProvider: (done) => done(null, updatedConnection.accessToken),
  });
  
  return {
    graphClient,
    emailAddress: updatedConnection.emailAddress,
  };
}

// ============================================================================
// Disconnect
// ============================================================================

/**
 * Revoke Gmail connection
 */
export async function revokeGmailConnection(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await getEmailConnection(userId, 'gmail');
    
    if (connection) {
      // Optionally notify Google to revoke token
      // For now, just mark as revoked
      await updateEmailConnection(userId, 'gmail', {
        status: 'revoked',
      });
    }
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Revoke failed' 
    };
  }
}

/**
 * Revoke Outlook connection
 */
export async function revokeOutlookConnection(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateEmailConnection(userId, 'outlook', {
      status: 'revoked',
    });
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Revoke failed' 
    };
  }
}
