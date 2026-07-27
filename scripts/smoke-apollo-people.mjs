/**
 * Smoke-test Apollo People API Search with env / tenant key.
 * Does not print the full API key.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    // strip vercel-cli quotes wrapping
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.vercel.pull'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

function mask(k) {
  if (!k || k.length < 12) return `(short:${(k || '').length})`;
  return `${k.slice(0, 6)}…${k.slice(-4)} len=${k.length}`;
}

function getEncryptionKey() {
  const secret =
    process.env.AI_CREDENTIALS_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptSecret(payload) {
  const key = getEncryptionKey();
  if (!key) throw new Error('no AI_CREDENTIALS_SECRET');
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8'
  );
}

async function search(apiKey, body, label) {
  console.log(`\n--- ${label} ---`);
  console.log('key:', mask(apiKey));
  console.log('body:', JSON.stringify(body));
  const res = await fetch(
    'https://api.apollo.io/api/v1/mixed_people/api_search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
        'Api-Key': apiKey,
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  console.log('status:', res.status);
  console.log('top keys:', data && typeof data === 'object' ? Object.keys(data) : typeof data);
  const people = data.people || data.contacts || data.profiles || [];
  console.log(
    'people:',
    Array.isArray(people) ? people.length : typeof people,
    'total:',
    data.pagination?.total_entries ?? data.total_entries ?? data.total
  );
  if (data.error || data.message || data.error_message) {
    console.log(
      'error field:',
      data.error || data.message || data.error_message
    );
  }
  if (Array.isArray(people) && people[0]) {
    const p = people[0];
    console.log('sample:', {
      name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      title: p.title,
      org: p.organization?.name || p.organization_name,
      has_linkedin: !!(p.linkedin_url || p.linkedin),
    });
  } else if (!res.ok) {
    console.log('body:', text.slice(0, 500));
  }
  return { status: res.status, count: Array.isArray(people) ? people.length : 0 };
}

async function main() {
  const platform =
    process.env.APOLLO_API_KEY ||
    process.env.Apollo_API_key ||
    process.env.APOLLO_API_key ||
    '';
  console.log('Platform key present:', !!platform.trim(), mask(platform.trim()));
  console.log(
    'AI_CREDENTIALS_SECRET present:',
    !!(process.env.AI_CREDENTIALS_SECRET || process.env.NEXTAUTH_SECRET)
  );

  const simple = {
    person_titles: ['Director of Operations'],
    per_page: 5,
    page: 1,
    include_similar_titles: true,
  };

  if (platform.trim()) {
    await search(platform.trim(), simple, 'platform key · titles only');
  }

  // Tenant BYOK
  const tenant = process.env.REVIEW_TENANT_ID || 'tenant-2024-001';
  try {
    const region = process.env.AWS_REGION || 'us-east-1';
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region }),
      { marshallOptions: { removeUndefinedValues: true } }
    );
    const cred = await client.send(
      new GetCommand({
        TableName: 'turnkey-profiles',
        Key: { id: `apollo-cred#${tenant}` },
      })
    );
    if (!cred.Item?.encryptedKey) {
      console.log('\nNo tenant Apollo credential for', tenant);
    } else {
      console.log(
        '\nTenant cred found, lastValidatedOk:',
        cred.Item.lastValidatedOk,
        'hint:',
        cred.Item.keyHint
      );
      try {
        const tenantKey = decryptSecret(cred.Item.encryptedKey).trim();
        await search(tenantKey, simple, `tenant ${tenant} · titles only`);
        await search(
          tenantKey,
          {
            person_titles: [
              'Director of Operations',
              'Operations Director',
              'Plant Director',
            ],
            per_page: 10,
            page: 1,
            include_similar_titles: true,
          },
          `tenant ${tenant} · multi title`
        );
      } catch (e) {
        console.log('Decrypt/search tenant failed:', e.message);
      }
    }
  } catch (e) {
    console.log('Dynamo tenant lookup failed:', e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
