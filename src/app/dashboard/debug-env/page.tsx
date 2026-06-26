export default function DebugEnv() {
  const vars = {
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '✅ PRESENT' : '❌ MISSING',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '✅ PRESENT' : '❌ MISSING',
    AWS_REGION: process.env.AWS_REGION || '❌ MISSING',
    DYNAMODB_CLIENTS_TABLE: process.env.DYNAMODB_CLIENTS_TABLE || '❌ MISSING',
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">AWS Env Debug</h1>
      <pre className="bg-gray-900 text-white p-6 rounded-xl">
        {JSON.stringify(vars, null, 2)}
      </pre>
    </div>
  );
}
