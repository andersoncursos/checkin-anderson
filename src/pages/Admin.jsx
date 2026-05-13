import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { query, isConnected } from "../supabase";
import { SQL_SETUP } from "../sql";
import { formatPhone, cleanPhone, fmtDate, fmtDateFull, weekday } from "../utils";
import { gerarCertificadoPDF, gerarCodigo, fmtDateBR } from "../certificado";

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("turmas");
  const [turmas, setTurmas] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [certificados, setCertificados] = useState([]);

  const [novaTurma, setNovaTurma] = useState({ nome: "", curso: "" });
  const [datasAulas, setDatasAulas] = useState([{ data: "", descricao: "" }]);
  const [novoAluno, setNovoAluno] = useState({ nome: "", celular: "", email: "", turma_id: "" });
  const [filtroTurma, setFiltroTurma] = useState("");
  const [turmaExpandida, setTurmaExpandida] = useState(null);
  const [certTurma, setCertTurma] = useState("");
  const [certCarga, setCertCarga] = useState("30");
  const [gerando, setGerando] = useState(false);
  const [editando, setEditando] = useState(null); // { id, nome, celular, email }

  const connected = isConnected();

  const carregarDados = useCallback(async () => {
    if (!connected) return;
    try {
      const [t, au, a, c, cert] = await Promise.all([
        query("turmas", { qs: "?select=*&order=criado_em.desc" }),
        query("aulas", { qs: "?select=*&order=data_aula.asc" }),
        query("alunos", { qs: "?select=*,turmas(nome,curso)&order=nome.asc" }),
        query("checkins", { qs: "?select=*,alunos(nome,celular),aulas(data_aula,descricao)&order=hora_checkin.desc" }),
        query("certificados", { qs: "?select=*&order=criado_em.desc" }),
      ]);
      setTurmas(t); setAulas(au); setAlunos(a); setCheckins(c); setCertificados(cert);
    } catch (err) { console.error(err); }
  }, [connected]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // --- Turma ---
  const criarTurma = async () => {
    if (!novaTurma.nome || !novaTurma.curso) return;
    const datasValidas = datasAulas.filter((d) => d.data);
    if (!datasValidas.length) { alert("Adicione pelo menos uma data de aula."); return; }
    try {
      const [turma] = await query("turmas", { method: "POST", body: novaTurma });
      for (const da of datasValidas) {
        await query("aulas", { method: "POST", body: { turma_id: turma.id, data_aula: da.data, descricao: da.descricao } });
      }
      setNovaTurma({ nome: "", curso: "" });
      setDatasAulas([{ data: "", descricao: "" }]);
      carregarDados();
    } catch (err) { alert("Erro: " + err.message); }
  };

  // --- Aluno ---
  const criarAluno = async () => {
    const cel = cleanPhone(novoAluno.celular);
    if (!novoAluno.nome || cel.length < 10 || !novoAluno.turma_id) return;
    try {
      await query("alunos", { method: "POST", body: { ...novoAluno, celular: cel } });
      setNovoAluno({ nome: "", celular: "", email: "", turma_id: "" });
      carregarDados();
    } catch (err) { alert("Erro: " + err.message); }
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    try {
      await query("alunos", {
        method: "PATCH",
        qs: `?id=eq.${editando.id}`,
        body: { nome: editando.nome, celular: cleanPhone(editando.celular), email: editando.email },
      });
      setEditando(null);
      carregarDados();
    } catch (err) { alert("Erro: " + err.message); }
  };

  // --- Datas ---
  const addDataAula = () => setDatasAulas([...datasAulas, { data: "", descricao: "" }]);
  const updateDataAula = (i, field, val) => { const c = [...datasAulas]; c[i][field] = val; setDatasAulas(c); };
  const removeDataAula = (i) => { if (datasAulas.length > 1) setDatasAulas(datasAulas.filter((_, idx) => idx !== i)); };

  // --- Helpers relatório ---
  const aulasDaTurma = (tid) => aulas.filter((a) => a.turma_id === tid).sort((a, b) => a.data_aula.localeCompare(b.data_aula));
  const alunosDaTurma = (tid) => alunos.filter((a) => a.turma_id === tid).sort((a, b) => a.nome.localeCompare(b.nome));
  const temCheckin = (alunoId, aulaId) => checkins.some((c) => c.aluno_id === alunoId && c.aula_id === aulaId);
  const turmasFiltradas = filtroTurma ? turmas.filter((t) => t.id === filtroTurma) : turmas;

  // --- Copiar link ---
  const copiarLink = (turmaId) => {
    const link = `${window.location.origin}/c/${turmaId}`;
    navigator.clipboard.writeText(link).then(() => alert("Link copiado!\n\n" + link)).catch(() => {
      prompt("Copie o link abaixo:", link);
    });
  };

  // --- Tabs ---
  const tabs = [
    { id: "turmas", label: "Turmas", icon: "📚" },
    { id: "alunos", label: "Alunos", icon: "👥" },
    { id: "relatorio", label: "Presença", icon: "📊" },
    { id: "certificados", label: "Certificados", icon: "📜" },
    { id: "setup", label: "Setup", icon: "⚙️" },
  ];

  const inp = {
    width: "100%", padding: "12px 16px", fontSize: 14, fontFamily: "'Montserrat', sans-serif",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,169,110,0.18)",
    borderRadius: 10, color: "#F1EFE8", outline: "none", boxSizing: "border-box",
  };
  const lbl = {
    color: "#888", fontFamily: "'Montserrat', sans-serif", fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "block",
  };
  const btnP = {
    padding: "12px 24px", fontSize: 14, fontFamily: "'Montserrat', sans-serif", fontWeight: 700,
    background: "linear-gradient(135deg, #C8A96E, #b8954e)", color: "#1A1A18", border: "none",
    borderRadius: 10, cursor: "pointer", boxShadow: "0 2px 12px rgba(200,169,110,0.2)",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#1A1A18", fontFamily: "'Montserrat', sans-serif" }}>
      {/* Top bar */}
      <div style={{
        background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(200,169,110,0.08)",
        padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 12,
      }}>
        <h1 style={{ color: "#F1EFE8", fontSize: 17, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: "linear-gradient(135deg, #C8A96E, #e0c68a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Anderson Cursos</span>
          <span style={{ color: "#444", fontWeight: 400 }}>|</span>
          <span style={{ color: "#999", fontWeight: 400, fontSize: 14 }}>Controle de Presença</span>
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#27ae60" : "#e74c3c" }} />
          <span style={{ color: "#777", fontSize: 11 }}>{connected ? "Supabase conectado" : "Não conectado"}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(200,169,110,0.08)", overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "13px 20px", fontSize: 12, fontFamily: "'Montserrat', sans-serif", fontWeight: 700,
            background: tab === t.id ? "rgba(200,169,110,0.08)" : "transparent",
            color: tab === t.id ? "#C8A96E" : "#555", border: "none",
            borderBottom: tab === t.id ? "2px solid #C8A96E" : "2px solid transparent",
            cursor: "pointer", whiteSpace: "nowrap", letterSpacing: 0.5,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>

        {/* ========== TURMAS ========== */}
        {tab === "turmas" && (
          <div>
            <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Nova Turma</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div><label style={lbl}>Nome da Turma</label><input placeholder="Ex: Turma 15 — Manhã" style={inp} value={novaTurma.nome} onChange={(e) => setNovaTurma({ ...novaTurma, nome: e.target.value })} /></div>
              <div><label style={lbl}>Curso</label><input placeholder="Ex: Meta Ads Completo" style={inp} value={novaTurma.curso} onChange={(e) => setNovaTurma({ ...novaTurma, curso: e.target.value })} /></div>
            </div>

            <label style={{ ...lbl, marginTop: 8, marginBottom: 10 }}>📅 Datas das Aulas</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {datasAulas.map((da, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ color: "#C8A96E", fontSize: 12, fontWeight: 700, minWidth: 42 }}>Aula {i + 1}</span>
                  <input type="date" style={{ ...inp, width: 170, flexShrink: 0 }} value={da.data} onChange={(e) => updateDataAula(i, "data", e.target.value)} />
                  <input placeholder="Descrição (opcional)" style={{ ...inp, flex: 1 }} value={da.descricao} onChange={(e) => updateDataAula(i, "descricao", e.target.value)} />
                  {datasAulas.length > 1 && (
                    <button onClick={() => removeDataAula(i)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addDataAula} style={{
              background: "rgba(200,169,110,0.1)", border: "1px dashed rgba(200,169,110,0.3)",
              color: "#C8A96E", padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              fontSize: 12, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, marginBottom: 18,
            }}>+ Adicionar data de aula</button>
            <br />
            <button style={btnP} onClick={criarTurma}>+ CRIAR TURMA</button>

            {/* Lista de turmas */}
            <h3 style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 700, marginTop: 36, marginBottom: 14 }}>
              Turmas Cadastradas ({turmas.length})
            </h3>
            {turmas.length === 0 ? (
              <p style={{ color: "#555", fontSize: 13 }}>{connected ? "Nenhuma turma." : "Configure o Supabase na aba Setup."}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {turmas.map((t) => {
                  const aulasT = aulasDaTurma(t.id);
                  const expanded = turmaExpandida === t.id;
                  return (
                    <div key={t.id} style={{ background: "rgba(255,255,255,0.025)", borderRadius: 12, border: "1px solid rgba(200,169,110,0.08)", overflow: "hidden" }}>
                      <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, cursor: "pointer" }} onClick={() => setTurmaExpandida(expanded ? null : t.id)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ color: expanded ? "#C8A96E" : "#666", transition: "transform 0.2s", display: "inline-block", transform: expanded ? "rotate(90deg)" : "", fontSize: 10 }}>▶</span>
                          <span style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 14 }}>{t.nome}</span>
                          <span style={{ color: "#C8A96E", fontSize: 12 }}>{t.curso}</span>
                          <span style={{ color: "#555", fontSize: 11 }}>{aulasT.length} aulas</span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={(e) => { e.stopPropagation(); copiarLink(t.id); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(200,169,110,0.12)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.25)", borderRadius: 8, cursor: "pointer" }}>
                            📋 COPIAR LINK
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/c/${t.id}`); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(39,174,96,0.12)", color: "#2ecc71", border: "1px solid rgba(39,174,96,0.25)", borderRadius: 8, cursor: "pointer" }}>
                            📱 TESTAR
                          </button>
                        </div>
                      </div>
                      {expanded && aulasT.length > 0 && (
                        <div style={{ padding: "0 18px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {aulasT.map((a, i) => (
                            <div key={a.id} style={{ background: "rgba(200,169,110,0.06)", padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(200,169,110,0.1)", fontSize: 11 }}>
                              <span style={{ color: "#C8A96E", fontWeight: 700 }}>Aula {i + 1}</span>
                              <span style={{ color: "#999", marginLeft: 6 }}>{fmtDate(a.data_aula)} ({weekday(a.data_aula)})</span>
                              {a.descricao && <span style={{ color: "#666", marginLeft: 4 }}>— {a.descricao}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========== ALUNOS ========== */}
        {tab === "alunos" && (
          <div>
            <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Cadastrar Aluno</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 16 }}>
              <div><label style={lbl}>Nome Completo</label><input placeholder="Maria Silva" style={inp} value={novoAluno.nome} onChange={(e) => setNovoAluno({ ...novoAluno, nome: e.target.value })} /></div>
              <div><label style={lbl}>Celular (WhatsApp)</label><input placeholder="(83) 99999-9999" type="tel" style={inp} value={novoAluno.celular} onChange={(e) => setNovoAluno({ ...novoAluno, celular: formatPhone(e.target.value) })} /></div>
              <div><label style={lbl}>E-mail</label><input placeholder="aluno@email.com" type="email" style={inp} value={novoAluno.email} onChange={(e) => setNovoAluno({ ...novoAluno, email: e.target.value })} /></div>
              <div><label style={lbl}>Turma</label>
                <select style={{ ...inp, appearance: "auto" }} value={novoAluno.turma_id} onChange={(e) => setNovoAluno({ ...novoAluno, turma_id: e.target.value })}>
                  <option value="">Selecione...</option>
                  {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome} — {t.curso}</option>)}
                </select>
              </div>
            </div>
            <button style={btnP} onClick={criarAluno}>+ CADASTRAR ALUNO</button>

            <h3 style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 700, marginTop: 36, marginBottom: 14 }}>Alunos ({alunos.length})</h3>
            {alunos.length === 0 ? (
              <p style={{ color: "#555", fontSize: 13 }}>Nenhum aluno cadastrado.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Nome", "Celular", "E-mail", "Turma", ""].map((h) => (
                      <th key={h || "acoes"} style={{ textAlign: "left", padding: "10px 16px", color: "#C8A96E", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(200,169,110,0.12)" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {alunos.map((a) => {
                      const isEdit = editando?.id === a.id;
                      return (
                      <tr key={a.id}>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          {isEdit ? <input style={{ ...inp, padding: "8px 10px", fontSize: 12 }} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} /> : <span style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 600 }}>{a.nome}</span>}
                        </td>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          {isEdit ? <input style={{ ...inp, padding: "8px 10px", fontSize: 12, width: 150 }} value={editando.celular} onChange={(e) => setEditando({ ...editando, celular: formatPhone(e.target.value) })} /> : <span style={{ color: "#888", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{formatPhone(a.celular)}</span>}
                        </td>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          {isEdit ? <input style={{ ...inp, padding: "8px 10px", fontSize: 12 }} value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} placeholder="email@..." /> : <span style={{ color: "#888", fontSize: 12 }}>{a.email || "—"}</span>}
                        </td>
                        <td style={{ padding: "8px 16px", color: "#888", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{a.turmas?.nome || "—"}</td>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)", whiteSpace: "nowrap" }}>
                          {isEdit ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={salvarEdicao} style={{ padding: "5px 12px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(39,174,96,0.15)", color: "#2ecc71", border: "1px solid rgba(39,174,96,0.3)", borderRadius: 6, cursor: "pointer" }}>✓ Salvar</button>
                              <button onClick={() => setEditando(null)} style={{ padding: "5px 10px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "transparent", color: "#888", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer" }}>✕</button>
                            </div>
                          ) : (
                            <button onClick={() => setEditando({ id: a.id, nome: a.nome, celular: formatPhone(a.celular), email: a.email || "" })} style={{ padding: "5px 12px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "rgba(200,169,110,0.08)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.15)", borderRadius: 6, cursor: "pointer" }}>✏️ Editar</button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========== RELATÓRIO ========== */}
        {tab === "relatorio" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, margin: 0 }}>Mapa de Presença</h2>
              <select style={{ ...inp, width: "auto", minWidth: 220 }} value={filtroTurma} onChange={(e) => setFiltroTurma(e.target.value)}>
                <option value="">Todas as turmas</option>
                {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome} — {t.curso}</option>)}
              </select>
            </div>

            {turmasFiltradas.length === 0 ? (
              <p style={{ color: "#555", fontSize: 13 }}>Nenhuma turma para exibir.</p>
            ) : turmasFiltradas.map((turma) => {
              const aulasT = aulasDaTurma(turma.id);
              const alunosT = alunosDaTurma(turma.id);
              if (!alunosT.length) return null;
              return (
                <div key={turma.id} style={{ marginBottom: 32 }}>
                  <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                    <h3 style={{ color: "#C8A96E", fontSize: 14, fontWeight: 700, margin: 0 }}>{turma.nome}</h3>
                    <span style={{ color: "#666", fontSize: 12 }}>{turma.curso}</span>
                    <span style={{ color: "#555", fontSize: 11 }}>({aulasT.length} aulas)</span>
                  </div>

                  <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(200,169,110,0.1)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: aulasT.length * 58 + 180 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "10px 14px", color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(200,169,110,0.1)", position: "sticky", left: 0, background: "#1A1A18", zIndex: 1, minWidth: 140 }}>Aluno</th>
                          {aulasT.map((a, i) => (
                            <th key={a.id} style={{ textAlign: "center", padding: "8px 4px", borderBottom: "1px solid rgba(200,169,110,0.1)", minWidth: 50 }}>
                              <div style={{ color: "#C8A96E", fontSize: 10, fontWeight: 700 }}>A{i + 1}</div>
                              <div style={{ color: "#666", fontSize: 9, marginTop: 1 }}>{fmtDate(a.data_aula)}</div>
                              <div style={{ color: "#555", fontSize: 9 }}>{weekday(a.data_aula)}</div>
                            </th>
                          ))}
                          <th style={{ textAlign: "center", padding: "10px 10px", color: "#C8A96E", fontSize: 10, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid rgba(200,169,110,0.1)", minWidth: 65 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alunosT.map((al) => {
                          const total = aulasT.filter((a) => temCheckin(al.id, a.id)).length;
                          const pct = aulasT.length ? Math.round((total / aulasT.length) * 100) : 0;
                          return (
                            <tr key={al.id}>
                              <td style={{ padding: "10px 14px", color: "#F1EFE8", fontSize: 12, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.03)", position: "sticky", left: 0, background: "#1A1A18", zIndex: 1 }}>{al.nome}</td>
                              {aulasT.map((a) => {
                                const ok = temCheckin(al.id, a.id);
                                return (
                                  <td key={a.id} style={{ textAlign: "center", padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                    <div style={{
                                      width: 26, height: 26, borderRadius: 6, margin: "0 auto",
                                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                                      background: ok ? "rgba(39,174,96,0.15)" : "rgba(255,255,255,0.03)",
                                      border: ok ? "1px solid rgba(39,174,96,0.3)" : "1px solid rgba(255,255,255,0.05)",
                                      color: ok ? "#2ecc71" : "#333",
                                    }}>{ok ? "✓" : "·"}</div>
                                  </td>
                                );
                              })}
                              <td style={{ textAlign: "center", padding: "10px 6px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                <span style={{ color: pct >= 75 ? "#2ecc71" : pct >= 50 ? "#f39c12" : "#e74c3c", fontWeight: 700, fontSize: 13 }}>{total}/{aulasT.length}</span>
                                <span style={{ color: "#555", fontSize: 10, marginLeft: 3 }}>({pct}%)</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(200,169,110,0.06)", borderRadius: 10, border: "1px solid rgba(200,169,110,0.1)" }}>
                    <p style={{ color: "#C8A96E", fontSize: 12, fontWeight: 600, margin: "0 0 6px" }}>📜 Dados para certificado:</p>
                    {alunosT.map((al) => {
                      const total = aulasT.filter((a) => temCheckin(al.id, a.id)).length;
                      const pct = aulasT.length ? Math.round((total / aulasT.length) * 100) : 0;
                      return <p key={al.id} style={{ color: "#999", fontSize: 11, margin: "2px 0" }}>{al.nome} — Frequência: {total}/{aulasT.length} aulas ({pct}%)</p>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========== CERTIFICADOS ========== */}
        {tab === "certificados" && (
          <div>
            <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Gerar Certificados</h2>

            {/* Form */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Turma</label>
                <select style={{ ...inp, appearance: "auto" }} value={certTurma} onChange={(e) => setCertTurma(e.target.value)}>
                  <option value="">Selecione a turma...</option>
                  {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome} — {t.curso}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Carga Horária (horas)</label>
                <input style={inp} value={certCarga} onChange={(e) => setCertCarga(e.target.value)} placeholder="Ex: 30" />
              </div>
            </div>

            {certTurma && (() => {
              const turma = turmas.find((t) => t.id === certTurma);
              const aulasT = aulasDaTurma(certTurma);
              const alunosT = alunosDaTurma(certTurma);
              if (!turma || !alunosT.length) return <p style={{ color: "#555", fontSize: 13 }}>Nenhum aluno nessa turma.</p>;

              const dataIni = aulasT.length ? aulasT[0].data_aula : "";
              const dataFin = aulasT.length ? aulasT[aulasT.length - 1].data_aula : "";
              const jaCertificados = certificados.filter((c) => c.turma_id === certTurma);

              const gerarTodos = async () => {
                if (!certCarga) { alert("Preencha a carga horária."); return; }
                setGerando(true);
                try {
                  for (const al of alunosT) {
                    // Check if already has certificate
                    const jaExiste = jaCertificados.find((c) => c.aluno_id === al.id);
                    if (jaExiste) continue;

                    const totalAulas = aulasT.length;
                    const presencas = aulasT.filter((a) => temCheckin(al.id, a.id)).length;
                    const freq = totalAulas ? Math.round((presencas / totalAulas) * 100) : 0;
                    const cod = gerarCodigo();

                    await query("certificados", {
                      method: "POST",
                      body: {
                        codigo: cod,
                        aluno_id: al.id,
                        turma_id: certTurma,
                        nome_aluno: al.nome,
                        nome_curso: turma.curso,
                        carga_horaria: certCarga,
                        data_inicio: dataIni,
                        data_fim: dataFin,
                        frequencia: freq,
                      },
                    });
                  }
                  await carregarDados();
                  alert("Certificados gerados com sucesso!");
                } catch (err) {
                  alert("Erro: " + err.message);
                }
                setGerando(false);
              };

              const baixarPDF = async (cert) => {
                try {
                  const doc = await gerarCertificadoPDF({
                    nomeAluno: cert.nome_aluno,
                    nomeCurso: cert.nome_curso,
                    cargaHoraria: cert.carga_horaria,
                    dataInicio: cert.data_inicio,
                    dataFim: cert.data_fim,
                    frequencia: cert.frequencia,
                    codigo: cert.codigo,
                  });
                  doc.save(`Certificado_${cert.nome_aluno.replace(/\s+/g, "_")}.pdf`);
                } catch (err) {
                  alert("Erro ao gerar PDF: " + err.message);
                }
              };

              const enviarEmail = async (cert) => {
                const al = alunosT.find((a) => a.id === cert.aluno_id);
                const email = al?.email;
                if (!email) { alert("Este aluno não tem e-mail cadastrado."); return; }
                try {
                  const doc = await gerarCertificadoPDF({
                    nomeAluno: cert.nome_aluno,
                    nomeCurso: cert.nome_curso,
                    cargaHoraria: cert.carga_horaria,
                    dataInicio: cert.data_inicio,
                    dataFim: cert.data_fim,
                    frequencia: cert.frequencia,
                    codigo: cert.codigo,
                  });
                  const pdfBase64 = doc.output("datauristring").split(",")[1];
                  const res = await fetch("/api/enviar-certificado", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      to: email,
                      nomeAluno: cert.nome_aluno,
                      nomeCurso: cert.nome_curso,
                      codigo: cert.codigo,
                      pdfBase64,
                    }),
                  });
                  const result = await res.json();
                  if (result.ok) alert(`Certificado enviado para ${email}!`);
                  else alert("Erro ao enviar: " + (result.error || "tente novamente"));
                } catch (err) {
                  alert("Erro: " + err.message);
                }
              };

              const enviarTodosEmail = async () => {
                const comEmail = jaCertificados.filter((cert) => {
                  const al = alunosT.find((a) => a.id === cert.aluno_id);
                  return al?.email;
                });
                if (!comEmail.length) { alert("Nenhum aluno tem e-mail cadastrado."); return; }
                if (!confirm(`Enviar certificado por e-mail para ${comEmail.length} aluno(s)?`)) return;
                setGerando(true);
                let enviados = 0;
                for (const cert of comEmail) {
                  try {
                    await enviarEmail(cert);
                    enviados++;
                  } catch { /* continue */ }
                }
                setGerando(false);
                alert(`${enviados}/${comEmail.length} certificados enviados!`);
              };

              return (
                <div>
                  <div style={{ marginBottom: 14, padding: "12px 16px", background: "rgba(200,169,110,0.06)", borderRadius: 10, border: "1px solid rgba(200,169,110,0.1)" }}>
                    <p style={{ color: "#C8A96E", fontSize: 12, fontWeight: 600, margin: 0 }}>
                      {turma.nome} — {turma.curso} · {aulasT.length} aulas · {alunosT.length} alunos
                      {dataIni && ` · ${fmtDateBR(dataIni)} a ${fmtDateBR(dataFin)}`}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                    {jaCertificados.length < alunosT.length && (
                      <button
                        style={{ ...btnP, opacity: gerando ? 0.6 : 1 }}
                        onClick={gerarTodos}
                        disabled={gerando}
                      >
                        {gerando ? "⏳ Gerando..." : `📜 GERAR CERTIFICADOS (${alunosT.length - jaCertificados.length} restantes)`}
                      </button>
                    )}
                    {jaCertificados.length > 0 && (
                      <button
                        style={{ ...btnP, background: "linear-gradient(135deg, #27ae60, #1e8449)", opacity: gerando ? 0.6 : 1 }}
                        onClick={enviarTodosEmail}
                        disabled={gerando}
                      >
                        {gerando ? "⏳ Enviando..." : `📧 ENVIAR TODOS POR E-MAIL`}
                      </button>
                    )}
                  </div>

                  {jaCertificados.length > 0 && (
                    <div>
                      <h3 style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
                        Certificados Gerados ({jaCertificados.length}/{alunosT.length})
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {jaCertificados.map((cert) => {
                          const al = alunosT.find((a) => a.id === cert.aluno_id);
                          const temEmail = !!al?.email;
                          return (
                          <div key={cert.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "12px 16px", background: "rgba(255,255,255,0.025)", borderRadius: 10,
                            border: "1px solid rgba(200,169,110,0.08)", flexWrap: "wrap", gap: 10,
                          }}>
                            <div>
                              <span style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 600 }}>{cert.nome_aluno}</span>
                              <span style={{ color: "#555", fontSize: 11, marginLeft: 10 }}>Código: </span>
                              <span style={{ color: "#C8A96E", fontSize: 11, fontWeight: 700 }}>{cert.codigo}</span>
                              <span style={{ color: "#555", fontSize: 11, marginLeft: 10 }}>Frequência: </span>
                              <span style={{
                                color: cert.frequencia >= 75 ? "#2ecc71" : cert.frequencia >= 50 ? "#f39c12" : "#e74c3c",
                                fontSize: 11, fontWeight: 700,
                              }}>{cert.frequencia}%</span>
                              {al?.email && <span style={{ color: "#555", fontSize: 10, marginLeft: 10 }}>📧 {al.email}</span>}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => baixarPDF(cert)}
                                style={{
                                  padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif",
                                  fontWeight: 700, background: "rgba(200,169,110,0.12)", color: "#C8A96E",
                                  border: "1px solid rgba(200,169,110,0.25)", borderRadius: 8, cursor: "pointer",
                                }}
                              >
                                📄 PDF
                              </button>
                              <button
                                onClick={() => enviarEmail(cert)}
                                disabled={!temEmail}
                                style={{
                                  padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif",
                                  fontWeight: 700, background: temEmail ? "rgba(39,174,96,0.12)" : "rgba(255,255,255,0.03)",
                                  color: temEmail ? "#2ecc71" : "#555",
                                  border: temEmail ? "1px solid rgba(39,174,96,0.25)" : "1px solid rgba(255,255,255,0.05)",
                                  borderRadius: 8, cursor: temEmail ? "pointer" : "default",
                                  opacity: temEmail ? 1 : 0.5,
                                }}
                              >
                                📧 E-MAIL
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ========== SETUP ========== */}
        {tab === "setup" && (
          <div>
            <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Configuração do Supabase</h2>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20, lineHeight: 1.7 }}>
              Execute o SQL abaixo no <span style={{ color: "#C8A96E", fontWeight: 600 }}>SQL Editor</span> do Supabase. As credenciais vão nas variáveis de ambiente do Vercel.
            </p>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 18, border: "1px solid rgba(200,169,110,0.08)", overflowX: "auto" }}>
              <pre style={{ color: "#C8A96E", fontSize: 11, fontFamily: "'Fira Code', 'Courier New', monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, lineHeight: 1.8 }}>{SQL_SETUP}</pre>
            </div>

            <div style={{ marginTop: 28, padding: 18, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(200,169,110,0.08)" }}>
              <h3 style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 700, margin: "0 0 14px" }}>📱 Fluxo na prática:</h3>
              {[
                "Crie a turma com as datas específicas de cada aula",
                "Cadastre os alunos (nome + celular WhatsApp)",
                "Clique em \"Copiar Link\" na turma e envie no WhatsApp",
                "O aluno abre, digita o celular, e confirma presença",
                "Na aba Presença, veja o mapa dia a dia com ✓ e ·",
                "Use os dados do relatório direto no certificado!",
              ].map((text, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #C8A96E, #b8954e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#1A1A18", flexShrink: 0 }}>{i + 1}</div>
                  <p style={{ color: "#bbb", fontSize: 12, margin: 0, lineHeight: 1.6 }}>{text}</p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(39,174,96,0.08)", borderRadius: 10, border: "1px solid rgba(39,174,96,0.15)" }}>
              <p style={{ color: "#2ecc71", fontSize: 12, fontWeight: 600, margin: 0 }}>
                💡 No Vercel: vá em Settings → Environment Variables e adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
