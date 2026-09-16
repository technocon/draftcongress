import type { Metadata } from "next";
import Link from "next/link";
import { Geist_Mono, Roboto } from "next/font/google";
import "./globals.css";
import { auth, signOut } from "@/server/auth";
import { withTenant } from "@/server/db/tenant-client";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
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

  const navLinkClass = "text-white/80 hover:text-white transition-colors";

  return (
    <html lang="en" className={`${roboto.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        {/* Single navy bar — wordmark, nav links, and account/CTA all in
            one row, mirroring nflmockdraftdatabase.com's draft-room header
            rather than the old two-tier RCP masthead. */}
        <header className="bg-[var(--color-navy)]">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3 text-sm">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-1.5 text-lg font-black text-white leading-none">
                <span className="inline-block w-1 h-5 bg-[var(--color-primary)] rounded-full" aria-hidden />
                Draft<span className="text-[var(--color-primary)]">Congress</span>
              </Link>
              <nav className="hidden sm:flex items-center gap-5">
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
              </nav>
            </div>
            <div className="flex items-center gap-4">
              {session?.user ? (
                <>
                  <span className="hidden sm:inline text-white/60 text-xs">
                    {session.user.name ?? session.user.email}
                    {session.user.entitlement?.tier === "paid" ? " · Paid" : " · Free"}
                  </span>
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
                </>
              ) : (
                <>
                  <Link href="/login" className={navLinkClass}>
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white px-4 py-1.5 font-semibold transition-colors"
                  >
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
