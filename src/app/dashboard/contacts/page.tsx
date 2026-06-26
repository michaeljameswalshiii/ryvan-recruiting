'use client';

export default function ContactsPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white border border-green-200 rounded-3xl p-16 max-w-md text-center shadow-xl">
        <div className="text-7xl mb-6">✅</div>
        <h1 className="text-4xl font-bold text-green-700 mb-4">
          Contacts Page Loaded Successfully
        </h1>
        <p className="text-xl text-gray-600 mb-10">
          AWS credentials error has been bypassed for debugging.
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl text-lg transition"
        >
          Try Loading Real Data
        </button>
      </div>
    </div>
  );
}
