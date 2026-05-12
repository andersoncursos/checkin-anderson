import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { query, isConnected } from "../supabase";
import { formatPhone, cleanPhone, fmtDateFull, weekday, todayStr } from "../utils";

export default function Checkin() {
  const { turmaId } = useParams();
  const [step, setStep] = useState("phone"); // phone | confirm | done
  const [phone, setPhone] = useState("");
  const [aluno, setAluno] = useState(null);
  const [turma, setTurma] = useState(null);
  const [aula, setAula] = useState(null);
  const [error, setError] = useState("");
  const [already, setAlready] = useState(false);
  const [noClass, setNoClass] = useState(false);

  // Load turma + today's aula
  useEffect(() => {
    if (!isConnected() || !turmaId) return;
    query("turmas", { qs: `?id=eq.${turmaId}&select=*` })
      .then((d) => d[0] && setTurma(d[0]))
      .catch(() => {});

    const hoje = todayStr();
    query("aulas", { qs: `?turma_id=eq.${turmaId}&data_aula=eq.${hoje}&select=*` })
      .then((d) => {
        if (d[0]) setAula(d[0]);
        else setNoClass(true);
      })
      .catch(() => setNoClass(true));
  }, [turmaId]);

  const buscarAluno = async () => {
    setError("");
    const cel = cleanPhone(phone);
    if (cel.length < 10) {
      setError("Digite um número válido com DDD.");
      return;
    }
    try {
      const data = await query("alunos", {
        qs: `?celular=eq.${cel}&turma_id=eq.${turmaId}&select=*`,
      });
      if (!data.length) {
        setError("Número não encontrado nessa turma. Verifique com o professor.");
        return;
      }
      setAluno(data[0]);
      setStep("confirm");
    } catch {
      setError("Erro ao buscar. Tente novamente.");
    }
  };

  const confirmarCheckin = async () => {
    if (!aula) {
      setError("Nenhuma aula cadastrada para hoje nessa turma.");
      return;
    }
    try {
      await query("checkins", {
        method: "POST",
        body: { aluno_id: aluno.id, aula_id: aula.id, turma_id: turmaId },
      });
      setStep("done");
      setAlready(false);
    } catch (err) {
      if (err.message.includes("duplicate") || err.message.includes("unique")) {
        setStep("done");
        setAlready(true);
      } else {
        setError("Erro ao registrar. Tente novamente.");
      }
    }
  };

  const s = {
    page: {
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #1A1A18 0%, #252521 40%, #1A1A18 100%)",
      padding: 20, fontFamily: "'Montserrat', sans-serif",
    },
    wrap: { width: "100%", maxWidth: 440, textAlign: "center" },
    card: {
      background: "rgba(255,255,255,0.035)", borderRadius: 16, padding: "28px 24px",
      border: "1px solid rgba(200,169,110,0.12)",
    },
    input: {
      width: "100%", padding: "16px 20px", fontSize: 22, fontFamily: "'Montserrat', sans-serif",
      background: "rgba(255,255,255,0.05)", border: "2px solid rgba(200,169,110,0.25)",
      borderRadius: 12, color: "#F1EFE8", textAlign: "center", letterSpacing: 1.5,
      outline: "none", boxSizing: "border-box", fontWeight: 600, transition: "border-color 0.2s",
    },
    btnPrimary: {
      width: "100%", marginTop: 18, padding: 16, fontSize: 15, fontFamily: "'Montserrat', sans-serif",
      fontWeight: 700, background: "linear-gradient(135deg, #C8A96E, #b8954e)", color: "#1A1A18",
      border: "none", borderRadius: 12, cursor: "pointer", boxShadow: "0 4px 16px rgba(200,169,110,0.25)",
    },
  };

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 14px",
            background: "linear-gradient(135deg, #C8A96E 0%, #e0c68a 100%)",
            borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 4px 20px rgba(200,169,110,0.25)",
          }}>✓</div>
          <h1 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 20, margin: 0 }}>
            Check-in de Presença
          </h1>
          {turma && (
            <p style={{ color: "#C8A96E", fontSize: 13, marginTop: 6, fontWeight: 600 }}>
              {turma.curso} — {turma.nome}
            </p>
          )}
          {aula && (
            <div style={{
              marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(200,169,110,0.1)", padding: "6px 16px", borderRadius: 20,
              border: "1px solid rgba(200,169,110,0.2)",
            }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <span style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700 }}>
                {fmtDateFull(aula.data_aula)} ({weekday(aula.data_aula)})
              </span>
              {aula.descricao && (
                <span style={{ color: "#999", fontSize: 12 }}>— {aula.descricao}</span>
              )}
            </div>
          )}
          <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>@professorjoseanderson.ads</p>
        </div>

        {/* No class today */}
        {noClass && !aula && (
          <div style={{ ...s.card, padding: "36px 24px" }}>
            <div style={{
              width: 64, height: 64, margin: "0 auto 16px", background: "rgba(200,169,110,0.1)",
              borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
            }}>📅</div>
            <h2 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 18, margin: "0 0 8px" }}>
              Sem aula hoje
            </h2>
            <p style={{ color: "#999", fontSize: 13, lineHeight: 1.7 }}>
              Não há aula cadastrada para hoje ({fmtDateFull(todayStr())}) nessa turma.<br />
              Verifique a data com o professor.
            </p>
          </div>
        )}

        {/* Phone step */}
        {step === "phone" && !noClass && (
          <div style={s.card}>
            <p style={{ color: "#ddd", fontSize: 14, marginBottom: 22, lineHeight: 1.7 }}>
              Digite seu número de celular<br />(o mesmo do WhatsApp):
            </p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="(83) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && buscarAluno()}
              style={s.input}
              onFocus={(e) => (e.target.style.borderColor = "#C8A96E")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(200,169,110,0.25)")}
            />
            {error && <p style={{ color: "#e74c3c", fontSize: 13, marginTop: 10 }}>{error}</p>}
            <button onClick={buscarAluno} style={s.btnPrimary}>
              BUSCAR MEU NOME
            </button>
          </div>
        )}

        {/* Confirm step */}
        {step === "confirm" && aluno && (
          <div style={{ ...s.card, padding: "32px 24px" }}>
            <div style={{
              width: 72, height: 72, margin: "0 auto 16px",
              background: "linear-gradient(135deg, #C8A96E, #e0c68a)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 20px rgba(200,169,110,0.3)",
            }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: "#1A1A18" }}>
                {aluno.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <h2 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 22, margin: "0 0 6px" }}>
              {aluno.nome}
            </h2>
            <p style={{ color: "#999", fontSize: 13, marginBottom: 24 }}>
              É você? Confirme sua presença.
            </p>
            {error && <p style={{ color: "#e74c3c", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => { setStep("phone"); setAluno(null); setPhone(""); setError(""); }}
                style={{
                  flex: 1, padding: 14, fontSize: 13, fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 600, background: "transparent", color: "#C8A96E",
                  border: "2px solid rgba(200,169,110,0.35)", borderRadius: 12, cursor: "pointer",
                }}>
                NÃO SOU EU
              </button>
              <button
                onClick={confirmarCheckin}
                style={{
                  flex: 2, padding: 14, fontSize: 14, fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700, background: "linear-gradient(135deg, #C8A96E, #b8954e)",
                  color: "#1A1A18", border: "none", borderRadius: 12, cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(200,169,110,0.25)",
                }}>
                ✓ CONFIRMAR PRESENÇA
              </button>
            </div>
          </div>
        )}

        {/* Done step */}
        {step === "done" && (
          <div style={{ ...s.card, padding: "36px 24px" }}>
            <div style={{
              width: 72, height: 72, margin: "0 auto 16px",
              background: already ? "rgba(200,169,110,0.12)" : "linear-gradient(135deg, #27ae60, #2ecc71)",
              borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, boxShadow: already ? "none" : "0 4px 20px rgba(39,174,96,0.3)",
            }}>
              {already ? "📋" : "✅"}
            </div>
            <h2 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 20, margin: "0 0 8px" }}>
              {already ? "Presença já registrada!" : "Presença confirmada!"}
            </h2>
            <p style={{ color: "#999", fontSize: 14, lineHeight: 1.6 }}>
              {already
                ? `${aluno?.nome}, seu check-in de hoje já estava feito.`
                : `${aluno?.nome}, presença registrada com sucesso.`}
            </p>
            {aula && (
              <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
                {fmtDateFull(aula.data_aula)} — {aula.descricao || "Aula do dia"}
              </p>
            )}
            <p style={{ color: "#C8A96E", fontSize: 13, marginTop: 20, fontWeight: 600 }}>
              Bom curso! 🚀
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
