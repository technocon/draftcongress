import Link from "next/link";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/server/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID);

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error === "CredentialsSignin" ? "Incorrect email or password." : "Sign-in failed — please try again."}
        </p>
      )}

      <form
        action={async (formData) => {
          "use server";
          try {
            await signIn("credentials", {
              email: formData.get("email"),
              password: formData.get("password"),
              redirectTo: "/leagues",
            });
          } catch (err) {
            if (err instanceof AuthError) {
              redirect(`/login?error=${err.type}`);
            }
            throw err;
          }
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input name="password" type="password" required className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2" />
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium">
          Sign in
        </button>
      </form>

      {hasGoogle && (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/leagues" });
          }}
        >
          <button type="submit" className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium">
            Continue with Google
          </button>
        </form>
      )}

      <p className="text-sm text-neutral-500">
        No account? <Link href="/register" className="underline">Create one</Link>
      </p>
    </div>
  );
}
