import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { createPortalSession } from "@/server/domain/billing/checkout";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const url = await createPortalSession(session.user.id, `${origin}/account/billing`);

  return NextResponse.json({ url });
}
