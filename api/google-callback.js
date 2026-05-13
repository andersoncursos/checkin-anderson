export const config = { runtime: "edge" };

export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Código não recebido", { status: 400 });
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = url.origin + "/api/google-callback";
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.refresh_token) {
      return new Response(
        `<html><body style="background:#1A1A18;color:#e74c3c;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h2>Erro</h2><p>Refresh token não recebido. Tente novamente.</p><a href="/" style="color:#C8A96E;">Voltar</a></div></body></html>`,
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    // Store refresh token in Supabase (config table)
    // First try to update, then insert
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/config?chave=eq.google_refresh_token&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const existing = await checkRes.json();

    if (existing.length > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/config?chave=eq.google_refresh_token`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ valor: tokens.refresh_token }),
        }
      );
    } else {
      await fetch(
        `${SUPABASE_URL}/rest/v1/config`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ chave: "google_refresh_token", valor: tokens.refresh_token }),
        }
      );
    }

    return new Response(
      `<html><body style="background:#1A1A18;color:#F1EFE8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><div style="font-size:60px;margin-bottom:16px;">✅</div><h2 style="color:#C8A96E;">Google Calendar Conectado!</h2><p style="color:#888;">Agora as aulas serão adicionadas automaticamente ao seu calendário.</p><a href="/" style="color:#C8A96E;font-weight:bold;">Voltar ao Painel</a></div></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return new Response(
      `<html><body style="background:#1A1A18;color:#e74c3c;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h2>Erro</h2><p>${err.message}</p><a href="/" style="color:#C8A96E;">Voltar</a></div></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}
