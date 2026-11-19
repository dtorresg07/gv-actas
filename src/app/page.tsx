import { pageUser } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { WelcomeModal } from "@/components/WelcomeModal";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await pageUser();
  return (
    <>
      <TopBar name={user.name} email={user.email} />
      <WelcomeModal name={user.name} loginAt={user.loginAt} />
      <main className="container">
        <Dashboard />
      </main>
    </>
  );
}
