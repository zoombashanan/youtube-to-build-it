import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-bold">YouTube to BUILD-IT</span>
          <Link
            href="/auth"
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="flex-1 max-w-5xl mx-auto px-6 py-20 sm:py-28 w-full">
        <div className="max-w-3xl">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight">
            Turn any YouTube tutorial into a step-by-step guide.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-gray-600 leading-relaxed">
            Paste a URL. Get a clean instructional guide in 2 minutes.
          </p>
          <div className="mt-8">
            <Link
              href="/auth"
              className="inline-block bg-green-600 text-white font-semibold px-7 py-4 rounded-lg hover:bg-green-700 transition text-base"
            >
              Get Started
            </Link>
          </div>
        </div>

        <div className="mt-24">
          <h2 className="text-2xl font-bold mb-8">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Card
              step="1"
              title="Paste the URL"
              body="Drop in any YouTube tutorial that has captions."
            />
            <Card
              step="2"
              title="Wait 2 minutes"
              body="We grab the transcript and turn it into a real guide."
            />
            <Card
              step="3"
              title="Read or download"
              body="Get a clean step-by-step. Save it as Markdown."
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 mt-12">
        <div className="max-w-5xl mx-auto px-6 py-8 text-sm text-gray-500 flex flex-col sm:flex-row gap-3 sm:gap-6 sm:items-center sm:justify-between">
          <span>
            Built by The Ultimate Farmer. Limited to 10 guides per user per day.
          </span>
          <Link href="/privacy" className="hover:text-gray-900 underline">
            Privacy
          </Link>
        </div>
      </footer>
    </main>
  );
}

function Card({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      <div className="text-xs font-bold text-green-600 mb-2">STEP {step}</div>
      <div className="text-lg font-semibold mb-2">{title}</div>
      <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
