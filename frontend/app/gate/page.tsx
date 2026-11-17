import { redirect } from "next/navigation";
import { gatePassword } from "@/lib/gate";
import GateForm from "./gate-form";

export const metadata = { title: "Private preview" };
export const dynamic = "force-dynamic";

/** Only safe local paths are followed after entering the password (no open redirect). */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/gate") ? next : "/";
}

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!gatePassword()) redirect(next); // the site is not private: nothing to enter
  return (
    <main className="page" style={{ maxWidth: 460, paddingTop: 64 }}>
      <h1>Private preview</h1>
      <p className="muted" style={{ margin: "8px 0 20px" }}>
        This ContractIQ site is open only to invited reviewers. Enter the site password you were given. You then sign in
        with your own account as usual.
      </p>
      <GateForm next={next} />
    </main>
  );
}
