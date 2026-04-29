import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { DAILY_CAP, getTodayCount } from "@/lib/usage";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const admin = createAdminClient();
  let used = 0;
  try {
    used = await getTodayCount(admin, user.id);
  } catch {
    // Read failure should not block the page; treat as 0.
  }

  return (
    <DashboardClient
      email={user.email ?? ""}
      initialUsed={used}
      cap={DAILY_CAP}
    />
  );
}
