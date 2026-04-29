"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not send the link. Try again.");
      }
      router.push(`/auth/check-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 mb-8 inline-block">
          &larr; Back
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sign in</h1>
        <p className="text-gray-600 mb-8">We will email you a one-click login link.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent text-gray-900"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || email.trim().length === 0}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Sending..." : "Send magic link"}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-8 text-center">
          By signing in you agree to our{" "}
          <Link href="/privacy" className="underline hover:text-gray-900">
            privacy promise
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
