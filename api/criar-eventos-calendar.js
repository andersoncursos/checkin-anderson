export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

  try {
    const { turma, aulas } = await req.json();

    if (!turma || !aulas || !aulas.length) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), { status: 400 });
    }

    // Get refresh token from Supabase
    const configRes = await fetch(
      `${SUPABASE_URL}/rest/v1/config?chave=eq.google_refresh_token&select=valor`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const configData = await configRes.json();

    if (!configData.length || !configData[0].valor) {
      return new Response(JSON.stringify({ error: "Google Calendar não conectado. Vá em Setup para conectar." }), { status: 400 });
    }

    const refreshToken = configData[0].valor;

    // Get access token from refresh token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return new Response(JSON.stringify({ error: "Falha ao obter access token. Reconecte o Google Calendar." }), { status: 400 });
    }

    const accessToken = tokenData.access_token;
    const hi = turma.horario_inicio || "18:00";
    const hf = turma.horario_fim || "21:00";
    const created = [];

    // Create events for each aula
    for (let i = 0; i < aulas.length; i++) {
      const aula = aulas[i];
      const isLast = i === aulas.length - 1;
      const summary = `${turma.curso} — Aula ${i + 1} (${turma.nome})${isLast ? " 🎓 Última aula!" : ""}`;
      const description = `${turma.nome} — ${turma.curso}${isLast ? " (Última aula!)" : ""}\nAnderson Cursos e Treinamentos`;

      const eventRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary,
            description,
            location: "João Pessoa — PB",
            start: {
              dateTime: `${aula.data}T${hi}:00`,
              timeZone: "America/Recife",
            },
            end: {
              dateTime: `${aula.data}T${hf}:00`,
              timeZone: "America/Recife",
            },
            colorId: "6", // Tangerine
            reminders: {
              useDefault: false,
              overrides: [
                { method: "popup", minutes: 60 },
                { method: "popup", minutes: 15 },
              ],
            },
          }),
        }
      );

      const eventData = await eventRes.json();
      if (eventData.id) {
        created.push({ aula: i + 1, data: aula.data, eventId: eventData.id });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, created: created.length, events: created }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
