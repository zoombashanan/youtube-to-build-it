import Link from "next/link";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email;

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-6">📬</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Check your email</h1>
        <p className="text-gray-600 mb-2">
          We just sent a sign-in link
          {email ? (
            <>
              {" "}to <span className="font-semibold text-gray-900">{email}</span>
            </>
          ) : null}
          .
        </p>
        <p className="text-gray-600 mb-8">Click the button in the email and you are in.</p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-900 mb-1">Did not get it?</p>
          <ul className="text-left space-y-1">
            <li>Check spam.</li>
            <li>Wait 60 seconds.</li>
            <li>
              <Link href="/auth" className="text-green-700 underline hover:text-green-900">
                Try again
              </Link>
              .
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
