import { useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const entrar = async () => {
    setErro("");
    if (!email || !senha) { setErro("Preencha e-mail e senha."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password: senha }),
      });
      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem("sb_token", data.access_token);
        localStorage.setItem("sb_refresh", data.refresh_token);
        localStorage.setItem("sb_user", JSON.stringify(data.user));
        onLogin(data);
      } else {
        setErro("E-mail ou senha incorretos.");
      }
    } catch {
      setErro("Erro ao conectar. Tente novamente.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #1A1A18 0%, #252521 40%, #1A1A18 100%)",
      padding: 20, fontFamily: "'Montserrat', sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 14px",
            background: "linear-gradient(135deg, #C8A96E 0%, #e0c68a 100%)",
            borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 4px 20px rgba(200,169,110,0.25)",
          }}>🔒</div>
          <h1 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 20, margin: 0 }}>
            Painel Administrativo
          </h1>
          <p style={{ color: "#C8A96E", fontSize: 13, marginTop: 6, fontWeight: 600 }}>
            Anderson Cursos
          </p>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.035)", borderRadius: 16, padding: "28px 24px",
          border: "1px solid rgba(200,169,110,0.12)",
        }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#888", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, textAlign: "left" }}>E-mail</label>
            <input
              type="email" placeholder="seu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              style={{
                width: "100%", padding: "14px 16px", fontSize: 14,
                fontFamily: "'Montserrat', sans-serif",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(200,169,110,0.2)", borderRadius: 10,
                color: "#F1EFE8", outline: "none", boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#C8A96E")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(200,169,110,0.2)")}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "#888", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, textAlign: "left" }}>Senha</label>
            <input
              type="password" placeholder="••••••••" value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              style={{
                width: "100%", padding: "14px 16px", fontSize: 14,
                fontFamily: "'Montserrat', sans-serif",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(200,169,110,0.2)", borderRadius: 10,
                color: "#F1EFE8", outline: "none", boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#C8A96E")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(200,169,110,0.2)")}
            />
          </div>
          {erro && <p style={{ color: "#e74c3c", fontSize: 13, marginBottom: 12 }}>{erro}</p>}
          <button
            onClick={entrar}
            disabled={loading}
            style={{
              width: "100%", padding: 16, fontSize: 15,
              fontFamily: "'Montserrat', sans-serif", fontWeight: 700,
              background: "linear-gradient(135deg, #C8A96E, #b8954e)",
              color: "#1A1A18", border: "none", borderRadius: 12, cursor: "pointer",
              boxShadow: "0 4px 16px rgba(200,169,110,0.25)",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Entrando..." : "ENTRAR"}
          </button>
        </div>

        <p style={{ color: "#444", fontSize: 11, marginTop: 20 }}>
          Acesso restrito ao administrador
        </p>
      </div>
    </div>
  );
}
