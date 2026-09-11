import Link from "next/link";
import { auth } from "@/server/auth";
import { Disclaimer } from "@/components/disclaimer";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-3xl font-semibold">Fantasy sports mechanics, applied to Congress.</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400 max-w-2xl">
          Draft legislative blocs onto a season-long roster, then score continuously against real bill activity,
          votes, and electoral outcomes — no cash stakes, ever.
        </p>
        <div className="mt-6 flex gap-3">
          {session?.user ? (
            <Link
              href="/leagues"
              className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium"
            >
              Go to your leagues
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium"
              >
                Create a free account
              </Link>
              <Link href="/login" className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium">
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
