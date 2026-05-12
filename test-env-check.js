/**
 * Check environment variables on server
 */

console.log('=== Environment Check ===');
console.log('');
console.log('AWS_REGION:', process.env.AWS_REGION || 'MISSING');
console.log('COGNITO_CLIENT_ID:', process.env.COGNITO_CLIENT_ID ? 'set' : 'MISSING');
console.log('COGNITO_USER_POOL_ID:', process.env.COGNITO_USER_POOL_ID ? 'set' : 'MISSING');
console.log('DYNAMODB_CLIENTS_TABLE:', process.env.DYNAMODB_CLIENTS_TABLE || 'MISSING');
console.log('DYNAMODB_PROFILES_TABLE:', process.env.DYNAMODB_PROFILES_TABLE || 'MISSING');
console.log('DYNAMODB_TENANTS_TABLE:', process.env.DYNAMODB_TENANTS_TABLE || 'MISSING');
console.log('APOLLO_API_KEY:', process.env.APOLLO_API_KEY ? 'set' : 'MISSING');
console.log('');
console.log('NEXT_PUBLIC_AWS_REGION:', process.env.NEXT_PUBLIC_AWS_REGION || 'MISSING');
console.log('NEXT_PUBLIC_COGNITO_CLIENT_ID:', process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || 'MISSING');
