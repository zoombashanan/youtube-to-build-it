import Link from "next/link";

export const metadata = {
  title: "Privacy | YouTube to BUILD-IT",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link href="/" className="font-bold">YouTube to BUILD-IT</Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy</h1>
        <p className="text-sm text-gray-500 mb-10">Plain English. No legalese.</p>

        <Section title="What we store">
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Your email. So you can sign in.</li>
            <li>Your daily usage count. So we can enforce the 10-per-day limit.</li>
            <li>An anonymous event log: success or error, your user ID, a timestamp.</li>
          </ul>
        </Section>

        <Section title="What we do NOT track">
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Which YouTube videos you process. Ever.</li>
            <li>The transcripts we fetch. They are processed and discarded.</li>
            <li>The guides we generate. They are sent to you and not stored.</li>
          </ul>
        </Section>

        <Section title="What we will not do">
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Sell your data. Ever.</li>
            <li>Share your data with third parties beyond what is required to run the service (Supabase for auth, Anthropic for the guide, Resend for email).</li>
            <li>Send you marketing emails. Sign-in links only.</li>
          </ul>
        </Section>

        <Section title="Want your account deleted?">
          <p className="text-gray-700">
            Email{" "}
            <a
              href="mailto:thespinedoc@gmail.com"
              className="text-green-700 underline hover:text-green-900"
            >
              thespinedoc@gmail.com
            </a>{" "}
            and we will purge your records within 7 days.
          </p>
        </Section>
      </article>

      <footer className="border-t border-gray-200 mt-12">
        <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-gray-500">
          Built by The Ultimate Farmer.
        </div>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold mb-3">{title}</h2>
      {children}
    </section>
  );
}
