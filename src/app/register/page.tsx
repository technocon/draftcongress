import Link from "next/link";
import { registerAction } from "@/server/actions/auth";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <form action={registerAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name (optional)
          <input name="name" type="text" className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium">
          Create account
        </button>
      </form>

      <p className="text-sm text-neutral-500">
        Already have an account? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </div>
  );
}
