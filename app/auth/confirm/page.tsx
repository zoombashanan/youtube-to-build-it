import { redirect } from "next/navigation";

// Interstitial page that holds a magic-link token_hash and only consumes it
// when the user clicks the button (form POST -> /api/auth/callback). Rendering
// the page does NOT consume the token, so corporate email scanners that GET
// links in incoming mail no longer burn the one-time token before the user.
//
// Note: this is scanner-resistant, not scanner-proof. A scanner that follows
// HTML forms and submits POSTs could still consume the token. In practice
// almost no scanners do that. The link is also single-use and expires in
// one hour, limiting damage even if a scanner did POST it.

type Search = { token_hash?: string; type?: string; next?: string };

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { token_hash, type, next } = await searchParams;
  if (!token_hash || !type) {
    redirect("/auth?error=invalid_link");
  }

  const nextPath =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Confirm sign-in</h1>
        <p className="text-gray-600 mb-8">
          Click below to finish signing in to BUILD-IT.
        </p>

        <form
          action="/api/auth/callback"
          method="POST"
          className="space-y-4"
        >
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={nextPath} />
          <button
            type="submit"
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition"
          >
            Sign in to BUILD-IT
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-8">
          This link is single-use and expires one hour after being sent.
        </p>
      </div>
    </main>
  );
}
