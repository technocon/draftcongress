import Link from "next/link";
import { auth } from "@/server/auth";
import { Disclaimer } from "@/components/disclaimer";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
          Fantasy sports mechanics, applied to Congress.
        </h1>
        <p className="mt-3 text-[var(--color-ink-soft)] max-w-2xl">
          Draft legislative blocs onto a season-long roster, then score continuously against real bill activity,
          votes, and electoral outcomes — no cash stakes, ever.
        </p>
        <div className="mt-6 flex gap-3">
          {session?.user ? (
            <Link href="/leagues" className="btn-primary">
              Go to your leagues
            </Link>
          ) : (
            <>
              <Link href="/register" className="btn-primary">
                Create a free account
              </Link>
              <Link href="/login" className="btn-secondary">
                Sign in
              </Link>
            </>
          )}
        </div>
      </section>

      <Disclaimer />
    </div>
  );
}
