import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Lora } from "next/font/google";
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

const headlineSerif = Lora({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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

  const navLinkClass = "text-white/85 hover:text-white transition-colors";

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${headlineSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <header>
          {/* Masthead: wordmark treatment echoes RCP's "RealClear" + red
              "Politics" block two-tone logo, without copying it directly. */}
          <div className="border-b border-[var(--color-rule)]">
            <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center text-2xl leading-none" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
                <span className="font-semibold text-[var(--color-ink)]">Draft</span>
                <span className="ml-1 bg-[var(--color-accent)] text-white px-2 py-0.5">Congress</span>
              </Link>
              {session?.user && (
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {session.user.name ?? session.user.email}
                  {session.user.entitlement?.tier === "paid" ? " · Paid" : " · Free"}
                </span>
              )}
            </div>
          </div>

          {/* Nav bar: near-black bar with white links, matching RCP's own nav. */}
          <nav className="bg-[var(--color-navy)]">
            <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="flex items-center gap-5">
                <Link href="/congress" className={navLinkClass}>
                  Congress
                </Link>
                {session?.user && (
                  <>
                    <Link href="/leagues" className={navLinkClass}>
                      Leagues
                    </Link>
                    <Link href="/account/billing" className={navLinkClass}>
                      Billing
                    </Link>
                    {isTenantAdmin && (
                      <Link href="/admin" className={navLinkClass}>
                        Admin
                      </Link>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-4">
                {session?.user ? (
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button type="submit" className={navLinkClass}>
                      Sign out
                    </button>
                  </form>
                ) : (
                  <>
                    <Link href="/login" className={navLinkClass}>
                      Sign in
                    </Link>
                    <Link href="/register" className="rounded bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] text-white px-3 py-1 font-medium transition-colors">
                      Create account
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
