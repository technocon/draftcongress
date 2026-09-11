"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { registerUser, RegistrationError } from "@/server/domain/auth/register";

export async function registerAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = formData.get("name") ? String(formData.get("name")) : undefined;

  try {
    await registerUser({ email, password, name });
  } catch (err) {
    if (err instanceof RegistrationError) {
      redirect(`/register?error=${encodeURIComponent(err.message)}`);
    }
    if (err instanceof ZodError) {
      redirect(`/register?error=${encodeURIComponent(err.issues[0]?.message ?? "Invalid input")}`);
    }
    throw err;
  }

  redirect("/login");
}
