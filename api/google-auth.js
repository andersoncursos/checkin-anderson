export const config = { runtime: "edge" };

export default async function handler(req) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const REDIRECT_URI = new URL("/api/google-callback", req.url).origin + "/api/google-callback";

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
