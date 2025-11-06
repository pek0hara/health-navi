export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Health Navi</h1>
        <p className="text-xl mb-2">LINE Webhook API</p>
        <p className="text-gray-600">
          Webhook endpoint: <code className="bg-gray-100 px-2 py-1 rounded">/api/webhook</code>
        </p>
      </div>
    </main>
  );
}
