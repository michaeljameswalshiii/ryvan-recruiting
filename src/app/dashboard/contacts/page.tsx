'use client';

export default function ContactsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
        <h1 className="text-3xl font-bold mb-4">✅ Contacts Page</h1>
        <p className="text-xl text-green-700">Page is now loading without AWS error.</p>
        <p className="mt-6 text-sm text-gray-600">
          (Data fetching temporarily bypassed for debugging)
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Loading Real Data
        </button>
      </div>
    </div>
  );
}
