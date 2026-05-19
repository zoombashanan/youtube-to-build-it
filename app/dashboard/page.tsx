import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { DAILY_CAP, getTodayCount } from "@/lib/usage";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Read the IANA timezone cookie set by DashboardClient on first mount.
  // Falls back to undefined (UTC) if the cookie is absent (new user, cleared cookies).
  const cookieStore = await cookies();
  const rawTz = cookieStore.get("user_tz")?.value;
  const tz = rawTz ? decodeURIComponent(rawTz) : undefined;

  const admin = createAdminClient();
  let used = 0;
  try {
    used = await getTodayCount(admin, user.id, tz);
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
