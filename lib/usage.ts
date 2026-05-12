import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const DAILY_CAP = 10;

type AdminClient = SupabaseClient<Database>;

function todayInTimeZone(tz?: string): string {
  // YYYY-MM-DD in the caller's IANA timezone. Falls back to UTC when tz is
  // missing or invalid so the SSR badge render path (no client TZ available)
  // stays functional.
  const d = new Date();
  if (!tz) return d.toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year");
    const m = get("month");
    const dd = get("day");
    if (!y || !m || !dd) return d.toISOString().slice(0, 10);
    return `${y}-${m}-${dd}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export async function getTodayCount(
  admin: AdminClient,
  userId: string,
  tz?: string
): Promise<number> {
  const date = todayInTimeZone(tz);
  const { data, error } = await admin
    .from("daily_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("usage_date", date)
    .maybeSingle<{ count: number }>();

  if (error) throw error;
  return data?.count ?? 0;
}

export async function incrementUsage(
  admin: AdminClient,
  userId: string,
  tz?: string
): Promise<number> {
  const date = todayInTimeZone(tz);

  // Try insert (count=1). If conflict, fetch + update.
  const { error: insertError } = await admin
    .from("daily_usage")
    .insert({ user_id: userId, usage_date: date, count: 1 });

  if (!insertError) return 1;

  // Conflict: fetch current, increment.
  const { data: existing, error: fetchError } = await admin
    .from("daily_usage")
    .select("id, count")
    .eq("user_id", userId)
    .eq("usage_date", date)
    .single<{ id: string; count: number }>();
  if (fetchError) throw fetchError;

  const newCount = (existing.count ?? 0) + 1;
  const { error: updateError } = await admin
    .from("daily_usage")
    .update({ count: newCount })
    .eq("id", existing.id);
  if (updateError) throw updateError;

  return newCount;
}

export async function logEvent(
  admin: AdminClient,
  eventType: string,
  userId: string | null
): Promise<void> {
  // Privacy: only event_type + user_id + timestamp. No URL, no transcript, no guide content.
  const { error } = await admin
    .from("analytics")
    .insert({ event_type: eventType, user_id: userId });
  if (error) {
    // Don't fail the request if analytics write fails. Log only.
    console.error("[analytics] write failed:", error.message);
  }
}
