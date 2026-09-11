import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/client";
import { getPublicTenant } from "@/server/auth/tenant";
import { registerSchema } from "@/lib/validation";

/**
 * Credentials-provider sign-up. NextAuth's PrismaAdapter only creates users
 * for adapter-linked flows (OAuth) — Credentials sign-in is intentionally
 * decoupled from that, so registration (hashing + row creation +
 * public-tenant enrollment) lives here rather than in an adapter event.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const tenant = await getPublicTenant();

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name, passwordHash },
    });
    await tx.tenantMembership.create({
      data: { tenantId: tenant.id, userId: created.id, role: "member" },
    });
    return created;
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
