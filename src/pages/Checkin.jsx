import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { query, isConnected } from "../supabase";
import { formatPhone, cleanPhone, fmtDateFull, weekday, todayStr, fmtDate } from "../utils";

// ===== Confetti animation =====
function Confetti({ active }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#C8A96E", "#e0c68a", "#27ae60", "#2ecc71", "#F1EFE8", "#3498db", "#f39c12"];
    const pieces = [];
    for (let i = 0; i < 80; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: Math.random() * 3 + 2,
        vx: Math.random() * 2 - 1,
        rot: Math.random() * 360,
        vr: Math.random() * 6 - 3,
        opacity: 1,
      });
    }

    let frame = 0;
    const maxFrames = 120;
    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.y += p.vy;
        p.x += p.vx;
        p.rot += p.vr;
        p.vy += 0.05;
        if (frame > maxFrames - 30) p.opacity = Math.max(0, p.opacity - 0.03);
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (frame < maxFrames) requestAnimationFrame(animate);
    };
    animate();
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        pointerEvents: "none", zIndex: 9999,
      }}
    />
  );
}

export default function Checkin() {
  const { turmaId } = useParams();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [aluno, setAluno] = useState(null);
  const [turma, setTurma] = useState(null);
  const [aula, setAula] = useState(null);
  const [proxAula, setProxAula] = useState(null);
  const [error, setError] = useState("");
  const [already, setAlready] = useState(false);
  const [noClass, setNoClass] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [foraHorario, setForaHorario] = useState(false);
  const [verificandoLocal, setVerificandoLocal] = useState(false);

  useEffect(() => {
    if (!isConnected() || !turmaId) return;
    query("turmas", { qs: `?id=eq.${turmaId}&select=*` })
      .then((d) => {
        if (!d[0]) return;
        setTurma(d[0]);
        // Check time window
        const t = d[0];
        if (t.horario_inicio && t.horario_fim) {
          const now = new Date();
          const [hi, mi] = t.horario_inicio.split(":").map(Number);
          const [hf, mf] = t.horario_fim.split(":").map(Number);
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const iniMin = hi * 60 + mi - 30; // 30 min antes
          const fimMin = hf * 60 + mf + 30; // 30 min depois
          if (nowMin < iniMin || nowMin > fimMin) setForaHorario(true);
        }
      })
      .catch(() => {});

    const hoje = todayStr();
    query("aulas", { qs: `?turma_id=eq.${turmaId}&data_aula=eq.${hoje}&select=*` })
      .then((d) => {
        if (d[0]) setAula(d[0]);
        else {
          setNoClass(true);
          // Find next class
          query("aulas", { qs: `?turma_id=eq.${turmaId}&data_aula=gt.${hoje}&select=*&order=data_aula.asc&limit=1` })
            .then((next) => next[0] && setProxAula(next[0]))
            .catch(() => {});
        }
      })
      .catch(() => setNoClass(true));
  }, [turmaId]);

  const buscarAluno = async () => {
    setError("");
    const cel = cleanPhone(phone);
    if (cel.length < 10) { setError("Digite um número válido com DDD."); return; }
    try {
      const data = await query("alunos", { qs: `?celular=eq.${cel}&turma_id=eq.${turmaId}&select=*` });
      if (!data.length) { setError("Número não encontrado nessa turma. Verifique com o professor."); return; }
      setAluno(data[0]);
      setStep("confirm");
    } catch { setError("Erro ao buscar. Tente novamente."); }
  };

  const confirmarCheckin = async () => {
    if (!aula) { setError("Nenhuma aula cadastrada para hoje nessa turma."); return; }

    // Time window check
    if (turma?.horario_inicio && turma?.horario_fim) {
      const now = new Date();
      const [hi, mi] = turma.horario_inicio.split(":").map(Number);
      const [hf, mf] = turma.horario_fim.split(":").map(Number);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const iniMin = hi * 60 + mi - 30;
      const fimMin = hf * 60 + mf + 30;
      if (nowMin < iniMin || nowMin > fimMin) {
        setError(`Check-in disponível apenas entre ${turma.horario_inicio} e ${turma.horario_fim} (com 30min de tolerância).`);
        return;
      }
    }

    // Geolocation check
    if (turma?.local_lat && turma?.local_lng) {
      setVerificandoLocal(true);
      setError("");
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
        });
        const dist = calcDistance(pos.coords.latitude, pos.coords.longitude, turma.local_lat, turma.local_lng);
        const raio = turma.local_raio || 200;
        setVerificandoLocal(false);
        if (dist > raio) {
          setError(`Você está a ${Math.round(dist)}m do local da aula. O check-in só é permitido num raio de ${raio}m.`);
          return;
        }
      } catch (geoErr) {
        setVerificandoLocal(false);
        setError("Permita o acesso à localização para fazer o check-in.");
        return;
      }
    }

    try {
      await query("checkins", { method: "POST", body: { aluno_id: aluno.id, aula_id: aula.id, turma_id: turmaId } });
      setStep("done");
      setAlready(false);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    } catch (err) {
      if (err.message.includes("duplicate") || err.message.includes("unique")) {
        setStep("done");
        setAlready(true);
      } else { setError("Erro ao registrar. Tente novamente."); }
    }
  };

  // Haversine formula
  function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

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
      <Confetti active={showConfetti} />
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

        {/* Fora do horário */}
        {foraHorario && !noClass && aula && step === "phone" && (
          <div style={{ ...s.card, padding: "36px 24px" }}>
            <div style={{ width: 64, height: 64, margin: "0 auto 16px", background: "rgba(241,196,15,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🕐</div>
            <h2 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 18, margin: "0 0 8px" }}>Fora do horário de check-in</h2>
            <p style={{ color: "#999", fontSize: 13, lineHeight: 1.7 }}>
              O check-in para <span style={{ color: "#C8A96E", fontWeight: 600 }}>{turma?.curso}</span> está disponível entre <span style={{ color: "#F1EFE8", fontWeight: 700 }}>{turma?.horario_inicio}</span> e <span style={{ color: "#F1EFE8", fontWeight: 700 }}>{turma?.horario_fim}</span> (com 30min de tolerância).
            </p>
            <p style={{ color: "#666", fontSize: 12, marginTop: 12 }}>Volte no horário da aula para registrar sua presença.</p>
          </div>
        )}

        {/* No class today - improved with next class info */}
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
              Não há aula de <span style={{ color: "#C8A96E", fontWeight: 600 }}>{turma?.curso || "curso"}</span> cadastrada para hoje ({fmtDateFull(todayStr())}).
            </p>
            {proxAula ? (
              <div style={{
                marginTop: 18, padding: "14px 18px", background: "rgba(200,169,110,0.08)",
                borderRadius: 10, border: "1px solid rgba(200,169,110,0.15)",
              }}>
                <p style={{ color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>
                  Próxima aula
                </p>
                <p style={{ color: "#C8A96E", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
                  {fmtDateFull(proxAula.data_aula)} ({weekday(proxAula.data_aula)})
                </p>
                {proxAula.descricao && (
                  <p style={{ color: "#999", fontSize: 12, margin: 0 }}>{proxAula.descricao}</p>
                )}
              </div>
            ) : (
              <p style={{ color: "#666", fontSize: 12, marginTop: 12 }}>
                Não há mais aulas programadas nessa turma.
              </p>
            )}
          </div>
        )}

        {/* Phone step - personalized welcome */}
        {step === "phone" && !noClass && !foraHorario && (
          <div style={s.card}>
            <p style={{ color: "#C8A96E", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              Bem-vindo(a)! 👋
            </p>
            <p style={{ color: "#ddd", fontSize: 14, marginBottom: 22, lineHeight: 1.7 }}>
              {turma ? (
                <>Marque sua presença na aula de <span style={{ color: "#C8A96E", fontWeight: 600 }}>{turma.curso}</span>.<br />Digite seu número de celular:</>
              ) : (
                <>Digite seu número de celular<br />(o mesmo do WhatsApp):</>
              )}
            </p>
            <input
              type="tel" inputMode="numeric" placeholder="(83) 99999-9999"
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
              É você? Confirme sua presença em <span style={{ color: "#C8A96E" }}>{turma?.curso}</span>.
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
                disabled={verificandoLocal}
                style={{
                  flex: 2, padding: 14, fontSize: 14, fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700, background: "linear-gradient(135deg, #C8A96E, #b8954e)",
                  color: "#1A1A18", border: "none", borderRadius: 12, cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(200,169,110,0.25)",
                  opacity: verificandoLocal ? 0.6 : 1,
                }}>
                {verificandoLocal ? "📍 Verificando localização..." : "✓ CONFIRMAR PRESENÇA"}
              </button>
            </div>
          </div>
        )}

        {/* Done step - with confetti for new checkins */}
        {step === "done" && (
          <div style={{ ...s.card, padding: "36px 24px" }}>
            <div style={{
              width: 80, height: 80, margin: "0 auto 16px",
              background: already ? "rgba(200,169,110,0.12)" : "linear-gradient(135deg, #27ae60, #2ecc71)",
              borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 40, boxShadow: already ? "none" : "0 4px 24px rgba(39,174,96,0.35)",
              animation: already ? "none" : "pulse 0.6s ease-out",
            }}>
              {already ? "📋" : "✅"}
            </div>
            <h2 style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 22, margin: "0 0 10px" }}>
              {already ? "Presença já registrada!" : "Presença confirmada!"}
            </h2>
            <p style={{ color: "#bbb", fontSize: 15, lineHeight: 1.6, marginBottom: 6 }}>
              {already
                ? <>{aluno?.nome}, seu check-in de hoje já estava feito.</>
                : <><span style={{ fontWeight: 700, color: "#F1EFE8" }}>{aluno?.nome}</span>, sua presença foi registrada com sucesso!</>}
            </p>
            {aula && (
              <p style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
                {fmtDateFull(aula.data_aula)} — {aula.descricao || turma?.curso || "Aula do dia"}
              </p>
            )}
            <div style={{
              marginTop: 20, padding: "12px 16px", background: "rgba(200,169,110,0.06)",
              borderRadius: 10, border: "1px solid rgba(200,169,110,0.1)",
            }}>
              <p style={{ color: "#C8A96E", fontSize: 14, fontWeight: 700, margin: 0 }}>
                {already ? "Tudo certo! 👍" : "Bom curso! 🚀"}
              </p>
              {turma && !already && (
                <p style={{ color: "#888", fontSize: 11, marginTop: 4, margin: "4px 0 0" }}>
                  {turma.curso} — {turma.nome}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.7); opacity: 0.5; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
