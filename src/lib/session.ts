import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { isAllowedEmail } from "./config";

/** Para páginas de servidor: usuario autenticado o redirección a /login. */
export async function pageUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";
  if (!session || !isAllowedEmail(email)) redirect("/login");
  return {
    name: session.user?.name ?? email.split("@")[0],
    email,
    loginAt: (session as unknown as { loginAt?: number }).loginAt ?? 0,
  };
}
