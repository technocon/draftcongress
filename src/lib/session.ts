import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

/** Server-component/action helper: redirects to /login if unauthenticated, otherwise returns the session. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id || !session.user.activeTenantId) {
    redirect("/login");
  }
  return session;
}
