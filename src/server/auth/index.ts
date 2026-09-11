import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/client";
import { getPublicTenant } from "./tenant";
import { resolveEntitlement, type Entitlement } from "./entitlement";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      activeTenantId: string;
      entitlement: Entitlement;
    } & DefaultSessionUser;
  }
}
type DefaultSessionUser = { name?: string | null; email?: string | null; image?: string | null };

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    activeTenantId?: string;
    entitlement?: Entitlement;
  }
}

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email;
      const password = credentials?.password;
      if (typeof email !== "string" || typeof password !== "string") return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers,
  pages: {
    signIn: "/login",
  },
  events: {
    /**
     * Fires when the Auth.js adapter creates a brand-new User row (OAuth
     * sign-up). Credentials-provider sign-in does NOT go through the
     * adapter's createUser flow (see src/app/api/register/route.ts for that
     * path), so registration there creates the TenantMembership directly.
     *
     * Auto-enrolls every new user into the seeded public tenant — SRD
     * §5.1's hybrid identity model, minus white-label tenant resolution,
     * which doesn't exist yet in Phase 1.
     */
    async createUser({ user }) {
      if (!user.id) return;
      const tenant = await getPublicTenant();
      await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: {},
        create: { tenantId: tenant.id, userId: user.id, role: "member" },
      });
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      const userId = user?.id ?? token.userId;
      if (!userId) return token;

      token.userId = userId;

      const tenant = await getPublicTenant();
      token.activeTenantId = tenant.id;

      // Recomputed on every call (not cached beyond this token round-trip)
      // so a Stripe webhook flipping a subscription is reflected on the
      // next request — see the architecture plan §3. This is a UI-gating
      // convenience only; every real authorization boundary re-resolves
      // entitlement itself (see requireEntitlement in ./entitlement.ts).
      token.entitlement = await resolveEntitlement(userId, tenant.id);

      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      if (token.activeTenantId) session.user.activeTenantId = token.activeTenantId;
      if (token.entitlement) session.user.entitlement = token.entitlement;
      return session;
    },
  },
});
