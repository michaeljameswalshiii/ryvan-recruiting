'use client';

export default function ContactsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-12 text-center">
        <h1 className="text-5xl font-bold text-green-700 mb-6">✅ Contacts Page</h1>
        <p className="text-2xl text-green-600 mb-8">
          This page is now loading successfully.
        </p>
        <p className="text-gray-600 mb-10">
          (AWS error bypassed for debugging)
        </p>

        <button 
          onClick={() => window.location.reload()} 
          className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-medium rounded-xl transition-colors"
        >
          Reload to Try Real Data
        </button>
      </div>
    </div>
  );
}
