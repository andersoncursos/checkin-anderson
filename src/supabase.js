const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export function isConnected() {
  return SUPABASE_URL && !SUPABASE_URL.includes("SEU-PROJETO") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("SUA-ANON");
}

export async function query(table, { method = "GET", body, qs = "" } = {}) {
  if (!isConnected()) throw new Error("Supabase não configurado");
  const url = `${SUPABASE_URL}/rest/v1/${table}${qs}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const res = await fetch(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
