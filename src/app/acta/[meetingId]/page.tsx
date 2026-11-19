import { pageUser } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { ActaEditor } from "@/components/ActaEditor";

export const dynamic = "force-dynamic";

export default async function ActaPage({ params }: { params: { meetingId: string } }) {
  const user = await pageUser();
  return (
    <>
      <TopBar name={user.name} email={user.email} />
      <main className="container">
        <ActaEditor meetingId={params.meetingId} user={{ name: user.name, email: user.email }} />
      </main>
    </>
  );
}
