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
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
        Create your account
      </h1>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <form action={registerAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name (optional)
          <input name="name" type="text" className="rc-input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rc-input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input name="password" type="password" required minLength={8} className="rc-input" />
        </label>
        <button type="submit" className="btn-primary">
          Create account
        </button>
      </form>

      <p className="text-sm text-[var(--color-ink-soft)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--color-accent)] hover:text-[var(--color-accent-dark)] underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
