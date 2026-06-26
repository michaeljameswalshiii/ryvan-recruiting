'use client';

export function ContactsClient() {
  return (
    <div className="p-8 max-w-7xl mx-auto text-center">
      <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center text-4xl mb-6">
        🔑
      </div>
      <h2 className="text-2xl font-semibold mb-3">AWS Credentials Required</h2>
      <p className="text-gray-600 max-w-md mx-auto">
        The app cannot connect to DynamoDB because AWS credentials are missing in Vercel.
      </p>
      <p className="text-sm text-gray-500 mt-6">
        Please add <code>AWS_ACCESS_KEY_ID</code>, <code>AWS_SECRET_ACCESS_KEY</code>, and <code>AWS_REGION</code> in Vercel Settings.
      </p>
    </div>
  );
}
