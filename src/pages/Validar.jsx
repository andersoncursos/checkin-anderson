import { useState } from "react";
import { useParams } from "react-router-dom";
import { query, isConnected } from "../supabase";

function fmtDateBR(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

export default function Validar() {
  const { codigo: paramCodigo } = useParams();
  const [codigo, setCodigo] = useState(paramCodigo || "");
  const [cert, setCert] = useState(null);
  const [buscou, setBuscou] = useState(false);
  const [loading, setLoading] = useState(false);

  const buscar = async () => {
    if (!codigo.trim()) return;
    setLoading(true);
    setBuscou(false);
    setCert(null);
    try {
      const data = await query("certificados", {
        qs: `?codigo=eq.${codigo.trim().toUpperCase()}&select=*`,
      });
      setCert(data.length ? data[0] : null);
      setBuscou(true);
    } catch {
      setBuscou(true);
    }
    setLoading(false);
  };

  // Auto-search if URL has codigo
  if (paramCodigo && !buscou && !loading) {
    buscar();
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #1A1A18 0%, #252521 40%, #1A1A18 100%)",
      padding: 20, fontFamily: "'Montserrat', sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 14px",
            background: "linear-gradient(135deg, #C8A96E 0%, #e0c68a 100%)",
            borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 4px 20px rgba(200,169,110,0.25)",
          }}>📜</div>
          <h1 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 20, margin: 0 }}>
            Validar Certificado
          </h1>
          <p style={{ color: "#C8A96E", fontSize: 13, marginTop: 6, fontWeight: 600 }}>
            Anderson Cursos e Treinamentos
          </p>
        </div>

        {/* Search */}
        {!cert && (
          <div style={{
            background: "rgba(255,255,255,0.035)", borderRadius: 16, padding: "28px 24px",
            border: "1px solid rgba(200,169,110,0.12)",
          }}>
            <p style={{ color: "#ddd", fontSize: 14, marginBottom: 22, lineHeight: 1.7 }}>
              Digite o código de verificação do certificado:
            </p>
            <input
              type="text"
              placeholder="Ex: AC-2026-ABC123"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              style={{
                width: "100%", padding: "16px 20px", fontSize: 20,
                fontFamily: "'Montserrat', sans-serif",
                background: "rgba(255,255,255,0.05)",
                border: "2px solid rgba(200,169,110,0.25)", borderRadius: 12,
                color: "#F1EFE8", textAlign: "center", letterSpacing: 2,
                outline: "none", boxSizing: "border-box", fontWeight: 700,
              }}
              onFocus={(e) => (e.target.style.borderColor = "#C8A96E")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(200,169,110,0.25)")}
            />
            {buscou && !cert && (
              <p style={{ color: "#e74c3c", fontSize: 13, marginTop: 12 }}>
                Certificado não encontrado. Verifique o código e tente novamente.
              </p>
            )}
            <button
              onClick={buscar}
              disabled={loading}
              style={{
                width: "100%", marginTop: 18, padding: 16, fontSize: 15,
                fontFamily: "'Montserrat', sans-serif", fontWeight: 700,
                background: "linear-gradient(135deg, #C8A96E, #b8954e)",
                color: "#1A1A18", border: "none", borderRadius: 12, cursor: "pointer",
                boxShadow: "0 4px 16px rgba(200,169,110,0.25)",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Buscando..." : "VALIDAR"}
            </button>
          </div>
        )}

        {/* Result */}
        {cert && (
          <div style={{
            background: "rgba(255,255,255,0.035)", borderRadius: 16, padding: "32px 24px",
            border: "1px solid rgba(200,169,110,0.12)", textAlign: "left",
          }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                width: 64, height: 64, margin: "0 auto 12px",
                background: "linear-gradient(135deg, #27ae60, #2ecc71)",
                borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 30, boxShadow: "0 4px 20px rgba(39,174,96,0.3)",
              }}>✅</div>
              <h2 style={{ color: "#2ecc71", fontWeight: 700, fontSize: 18, margin: 0 }}>
                Certificado Válido
              </h2>
            </div>

            {[
              { label: "ALUNO", value: cert.nome_aluno },
              { label: "CURSO", value: cert.nome_curso },
              { label: "CARGA HORÁRIA", value: `${cert.carga_horaria} horas/aula` },
              { label: "PERÍODO", value: `${fmtDateBR(cert.data_inicio)} a ${fmtDateBR(cert.data_fim)}` },
              { label: "FREQUÊNCIA", value: `${cert.frequencia}%`, color: cert.frequencia >= 75 ? "#2ecc71" : "#f39c12" },
              { label: "CÓDIGO", value: cert.codigo },
            ].map((item, i) => (
              <div key={i} style={{
                padding: "10px 0",
                borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <p style={{ color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 3px" }}>
                  {item.label}
                </p>
                <p style={{ color: item.color || "#F1EFE8", fontSize: 14, fontWeight: 600, margin: 0 }}>
                  {item.value}
                </p>
              </div>
            ))}

            <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(39,174,96,0.08)", borderRadius: 8, border: "1px solid rgba(39,174,96,0.15)" }}>
              <p style={{ color: "#2ecc71", fontSize: 11, margin: 0, lineHeight: 1.6 }}>
                Este certificado foi emitido pela Anderson Cursos e Treinamentos LTDA — CNPJ 24.335.154/0001-00
              </p>
            </div>

            <button
              onClick={() => { setCert(null); setCodigo(""); setBuscou(false); }}
              style={{
                width: "100%", marginTop: 16, padding: 12, fontSize: 13,
                fontFamily: "'Montserrat', sans-serif", fontWeight: 600,
                background: "transparent", color: "#C8A96E",
                border: "2px solid rgba(200,169,110,0.35)", borderRadius: 12, cursor: "pointer",
              }}
            >
              ← Validar outro certificado
            </button>
          </div>
        )}

        <p style={{ color: "#444", fontSize: 11, marginTop: 20 }}>
          andersoncursos.com
        </p>
      </div>
    </div>
  );
}
