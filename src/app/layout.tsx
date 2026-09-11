import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth, signOut } from "@/server/auth";
import { withTenant } from "@/server/db/tenant-client";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Draft Congress",
  description: "Fantasy sports mechanics, applied to legislative blocs.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  const isTenantAdmin =
    session?.user?.id && session.user.activeTenantId
      ? await withTenant(session.user.activeTenantId, (tx) =>
          tx.tenantMembership
            .findUnique({ where: { tenantId_userId: { tenantId: session.user.activeTenantId, userId: session.user.id } } })
            .then((m) => m?.role === "admin")
        )
      : false;

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold">
              Draft Congress
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/congress">Congress</Link>
              {session?.user ? (
                <>
                  <Link href="/leagues">Leagues</Link>
                  <Link href="/account/billing">Billing</Link>
                  {isTenantAdmin && <Link href="/admin">Admin</Link>}
                  <span className="text-neutral-500">
                    {session.user.name ?? session.user.email}
                    {session.user.entitlement?.tier === "paid" ? " · Paid" : " · Free"}
                  </span>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button type="submit" className="underline">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login">Sign in</Link>
                  <Link href="/register">Create account</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
