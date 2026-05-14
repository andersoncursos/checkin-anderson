import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { query, isConnected } from "../supabase";
import { SQL_SETUP } from "../sql";
import { formatPhone, cleanPhone, fmtDate, fmtDateFull, weekday, todayStr } from "../utils";
import { gerarCertificadoPDF, gerarCodigo, fmtDateBR } from "../certificado";

export default function Admin({ onLogout }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [turmas, setTurmas] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [alunos, setAlunos] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [certificados, setCertificados] = useState([]);
  const [contratos, setContratos] = useState([]);

  const [novaTurma, setNovaTurma] = useState({ nome: "", curso: "", carga_horaria: "30-noite", horario_inicio: "18:00", horario_fim: "21:00" });
  const [datasAulas, setDatasAulas] = useState([{ data: "", descricao: "" }]);
  const [novoAluno, setNovoAluno] = useState({ nome: "", celular: "", email: "", turma_id: "", cpf: "", endereco: "", bairro: "", cidade: "João Pessoa", estado: "PB", pag_forma: "pix", pag_valor: "", pag_parcelas: "", pag_valor_parcela: "" });
  const [filtroTurma, setFiltroTurma] = useState("");
  const [turmaExpandida, setTurmaExpandida] = useState(null);
  const [certTurma, setCertTurma] = useState("");
  const [certCarga, setCertCarga] = useState("30");
  const [certFreqMin, setCertFreqMin] = useState("75");
  const [gerando, setGerando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [previewCert, setPreviewCert] = useState(null);
  const [certObs, setCertObs] = useState({}); // { id, nome, celular, email }

  const connected = isConnected();

  const carregarDados = useCallback(async () => {
    if (!connected) return;
    try {
      const [t, au, a, c, cert, cont] = await Promise.all([
        query("turmas", { qs: "?select=*&order=criado_em.desc" }),
        query("aulas", { qs: "?select=*&order=data_aula.asc" }),
        query("alunos", { qs: "?select=*,turmas(nome,curso)&order=nome.asc" }),
        query("checkins", { qs: "?select=*,alunos(nome,celular),aulas(data_aula,descricao)&order=hora_checkin.desc" }),
        query("certificados", { qs: "?select=*&order=criado_em.desc" }),
        query("contratos", { qs: "?select=*&order=criado_em.desc" }),
      ]);
      setTurmas(t); setAulas(au); setAlunos(a); setCheckins(c); setCertificados(cert); setContratos(cont);
    } catch (err) { console.error(err); }
  }, [connected]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // --- Turma ---
  const isWeekend = novaTurma.carga_horaria === "18";
  const getCH = (ch) => ch === "18" ? "18" : ch === "30-tarde" ? "30" : ch === "30-noite" ? "30" : ch || "30";
  const getFmtTurma = (ch) => ch === "18" ? "18h (Fim de semana)" : ch === "30-tarde" ? "30h (Tarde)" : ch === "30-noite" ? "30h (Noite)" : (ch || "30") + "h";

  const criarTurma = async () => {
    if (!novaTurma.nome || !novaTurma.curso) return;
    const datasValidas = datasAulas.filter((d) => d.data);
    if (!datasValidas.length) { alert("Adicione pelo menos uma data de aula."); return; }
    try {
      const [turma] = await query("turmas", { method: "POST", body: novaTurma });

      // For weekend turmas: each date creates 2 aulas (manha + tarde)
      const aulasParaCalendar = [];
      if (isWeekend) {
        for (const da of datasValidas) {
          await query("aulas", { method: "POST", body: { turma_id: turma.id, data_aula: da.data, descricao: (da.descricao ? da.descricao + " — " : "") + "Manhã", turno: "manha" } });
          await query("aulas", { method: "POST", body: { turma_id: turma.id, data_aula: da.data, descricao: (da.descricao ? da.descricao + " — " : "") + "Tarde", turno: "tarde" } });
          aulasParaCalendar.push({ data: da.data, descricao: "Manhã", horario_inicio: "09:00", horario_fim: "12:00" });
          aulasParaCalendar.push({ data: da.data, descricao: "Tarde", horario_inicio: "14:30", horario_fim: "18:00" });
        }
      } else {
        for (const da of datasValidas) {
          await query("aulas", { method: "POST", body: { turma_id: turma.id, data_aula: da.data, descricao: da.descricao } });
          aulasParaCalendar.push({ data: da.data, descricao: da.descricao, horario_inicio: novaTurma.horario_inicio, horario_fim: novaTurma.horario_fim });
        }
      }

      // Auto-create Google Calendar events
      try {
        const calRes = await fetch("/api/criar-eventos-calendar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turma: { nome: novaTurma.nome, curso: novaTurma.curso, horario_inicio: novaTurma.horario_inicio, horario_fim: novaTurma.horario_fim },
            aulas: aulasParaCalendar,
          }),
        });
        const calData = await calRes.json();
        if (calData.ok) alert(`Turma criada! ${calData.created} aula(s) adicionadas ao Google Calendar 📅`);
        else alert("Turma criada! (Google Calendar: " + (calData.error || "não conectado") + ")");
      } catch { alert("Turma criada! (Google Calendar não disponível)"); }
      setNovaTurma({ nome: "", curso: "", carga_horaria: "30-noite", horario_inicio: "18:00", horario_fim: "21:00" });
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
      // Send welcome email
      const turma = turmas.find((t) => t.id === novoAluno.turma_id);
      if (novoAluno.email && turma) {
        const aulasT = aulasDaTurma(turma.id);
        const dataIni = aulasT.length ? fmtDateFull(aulasT[0].data_aula) : "";
        const dataFin = aulasT.length ? fmtDateFull(aulasT[aulasT.length - 1].data_aula) : "";
        const periodo = dataIni && dataFin ? `${dataIni} a ${dataFin}` : "";
        const temManual = !!turma.manual_url;

        // If turma has manual, fetch it and convert to base64
        let manualBase64 = null;
        if (temManual) {
          try {
            const pdfRes = await fetch(turma.manual_url);
            const pdfBlob = await pdfRes.blob();
            manualBase64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(",")[1]);
              reader.readAsDataURL(pdfBlob);
            });
          } catch { /* manual won't be attached */ }
        }

        const htmlEmail = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1A18;padding:40px 30px;border-radius:8px;">
            <div style="text-align:center;margin-bottom:30px;"><h1 style="color:#C8A96E;font-size:24px;margin:0;">Anderson Cursos</h1><p style="color:#888;font-size:12px;margin-top:4px;">Cursos & Treinamentos</p></div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,110,0.15);border-radius:8px;padding:24px;">
              <p style="color:#F1EFE8;font-size:16px;margin:0 0 12px;">Olá, <strong>${novoAluno.nome}</strong>! 👋</p>
              <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Seja bem-vindo(a) ao curso <strong style="color:#C8A96E;">${turma.curso}</strong> — <strong>${turma.nome}</strong>!</p>
              <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Estamos felizes em ter você conosco. Aqui vão algumas informações importantes:</p>
              <div style="background:rgba(200,169,110,0.08);border:1px solid rgba(200,169,110,0.2);border-radius:8px;padding:16px;margin-bottom:16px;">
                <p style="color:#C8A96E;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Informações do curso</p>
                <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">📚 <strong>${turma.curso}</strong> — ${turma.nome}</p>
                <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">⏱ Carga horária: ${getCH(turma.carga_horaria)}h</p>
                ${periodo ? `<p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">📅 Período: ${periodo}</p>` : ""}
                <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">🕐 Horário: ${turma.carga_horaria === "18" ? "Sábado e Domingo, 09:00 às 12:00 e 14:30 às 18:00" : (turma.horario_inicio || "18:00") + " às " + (turma.horario_fim || "21:00")}</p>
                <p style="color:#F1EFE8;font-size:13px;margin:0;">📍 Local: Anderson Cursos e Treinamentos</p>
              </div>
              ${temManual ? `<div style="background:rgba(39,174,96,0.08);border:1px solid rgba(39,174,96,0.2);border-radius:8px;padding:14px;margin-bottom:16px;">
                <p style="color:#2ecc71;font-size:13px;font-weight:600;margin:0;">📄 Segue em anexo o <strong>Manual do Participante</strong>. Leia com atenção antes do início do curso!</p>
              </div>` : ""}
              <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">No dia da aula, você receberá um link no WhatsApp para registrar sua presença. É rápido: abra o link, digite seu celular e confirme.</p>
              <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0;">Qualquer dúvida, entre em contato pelo WhatsApp <strong style="color:#F1EFE8;">(83) 99658-4198</strong>.</p>
            </div>
            <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(200,169,110,0.1);margin-top:20px;"><p style="color:#666;font-size:11px;margin:0;">Anderson Cursos e Treinamentos · João Pessoa — PB</p></div>
          </div>`;

        // Send via API with optional attachment
        fetch("/api/enviar-certificado", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: novoAluno.email, nomeAluno: novoAluno.nome, nomeCurso: turma.curso,
            codigo: "__boasvindas__", pdfBase64: manualBase64,
            assunto: `Bem-vindo(a) ao curso ${turma.curso}! 🎉`,
            htmlCustom: htmlEmail,
            manualFilename: temManual ? `Manual_${turma.curso.replace(/\s+/g, "_")}.pdf` : null,
          }),
        }).catch(() => {});
      }

      // Open WhatsApp with welcome message
      const cel = cleanPhone(novoAluno.celular);
      const celFormatado = cel.length === 11 ? `55${cel}` : cel.length === 10 ? `55${cel}` : cel;
      const aulasT = aulasDaTurma(turma.id);
      const dataIni = aulasT.length ? fmtDateFull(aulasT[0].data_aula) : "";
      const dataFin = aulasT.length ? fmtDateFull(aulasT[aulasT.length - 1].data_aula) : "";
      const periodoWa = dataIni && dataFin ? `📅 Período: ${dataIni} a ${dataFin}` : "";
      const horarioWa = turma.carga_horaria === "18"
        ? "🕐 Horário: Sábado e Domingo, 9h às 12h e 14h30 às 18h"
        : `🕐 Horário: ${turma.horario_inicio || "18:00"} às ${turma.horario_fim || "21:00"}`;
      const waMsg = `Olá, *${novoAluno.nome}*! 👋\n\nSeja bem-vindo(a) ao curso *${turma.curso}* — *${turma.nome}*!\n\n📚 *Informações do curso:*\n⏱ Carga horária: ${getCH(turma.carga_horaria)}h\n${periodoWa}\n${horarioWa}\n📍 Local: Anderson Cursos e Treinamentos\n\nNo dia da aula, você receberá um link aqui no WhatsApp para registrar sua presença. É rápido!\n\nQualquer dúvida, estou à disposição. Bom curso! 🚀\n\n_Prof. José Anderson_\n_Anderson Cursos e Treinamentos_`;
      const waUrl = `https://wa.me/${celFormatado}?text=${encodeURIComponent(waMsg)}`;
      window.open(waUrl, "_blank");

      // Create contract via Autentique if CPF provided
      if (novoAluno.cpf && novoAluno.email && novoAluno.pag_valor) {
        try {
          const contRes = await fetch("/api/criar-contrato", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              aluno: { nome: novoAluno.nome, cpf: novoAluno.cpf, email: novoAluno.email, endereco: novoAluno.endereco, bairro: novoAluno.bairro, cidade: novoAluno.cidade, estado: novoAluno.estado },
              turma: {
                curso: turma.curso, nome: turma.nome,
                carga_horaria: getCH(turma.carga_horaria),
                periodo: periodo,
                horario: turma.carga_horaria === "18" ? "9h às 12h e 14h30 às 18h" : `${turma.horario_inicio || "18:00"} às ${turma.horario_fim || "21:00"}`,
              },
              pagamento: novoAluno.pag_forma === "pix"
                ? { forma: "pix", valor: novoAluno.pag_valor }
                : { forma: "cartao", valor_total: novoAluno.pag_valor, parcelas: novoAluno.pag_parcelas, valor_parcela: novoAluno.pag_valor_parcela },
            }),
          });
          const contData = await contRes.json();
          if (contData.ok) {
            // Save contract to Supabase
            const alunosCriados = await query("alunos", { qs: `?celular=eq.${cel}&turma_id=eq.${turma.id}&select=id` });
            if (alunosCriados[0]) {
              await query("contratos", { method: "POST", body: {
                aluno_id: alunosCriados[0].id, turma_id: turma.id,
                autentique_id: contData.autentique_id, status: "pendente",
                link_assinatura: contData.link_assinatura,
              }});
            }
          }
        } catch { /* contract failed silently */ }
      }

      setNovoAluno({ nome: "", celular: "", email: "", turma_id: "", cpf: "", endereco: "", bairro: "", cidade: "João Pessoa", estado: "PB", pag_forma: "pix", pag_valor: "", pag_parcelas: "", pag_valor_parcela: "" });
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

  // --- Excluir ---
  const excluirTurma = async (id) => {
    if (!confirm("Tem certeza que deseja excluir esta turma? Todos os dados (aulas, check-ins, certificados) serão perdidos.")) return;
    try {
      await query("checkins", { method: "DELETE", qs: `?turma_id=eq.${id}` });
      await query("certificados", { method: "DELETE", qs: `?turma_id=eq.${id}` });
      await query("alunos", { method: "DELETE", qs: `?turma_id=eq.${id}` });
      await query("aulas", { method: "DELETE", qs: `?turma_id=eq.${id}` });
      await query("turmas", { method: "DELETE", qs: `?id=eq.${id}` });
      carregarDados();
    } catch (err) { alert("Erro: " + err.message); }
  };

  const excluirAluno = async (id) => {
    if (!confirm("Excluir este aluno?")) return;
    try {
      await query("checkins", { method: "DELETE", qs: `?aluno_id=eq.${id}` });
      await query("certificados", { method: "DELETE", qs: `?aluno_id=eq.${id}` });
      await query("alunos", { method: "DELETE", qs: `?id=eq.${id}` });
      carregarDados();
    } catch (err) { alert("Erro: " + err.message); }
  };

  // --- Presença manual ---
  const toggleCheckin = async (alunoId, aulaId, turmaId) => {
    const existe = checkins.find((c) => c.aluno_id === alunoId && c.aula_id === aulaId);
    try {
      if (existe) {
        await query("checkins", { method: "DELETE", qs: `?id=eq.${existe.id}` });
      } else {
        await query("checkins", { method: "POST", body: { aluno_id: alunoId, aula_id: aulaId, turma_id: turmaId } });
      }
      carregarDados();
    } catch (err) { alert("Erro: " + err.message); }
  };

  // --- Finalizar turma ---
  const finalizarTurma = async (id) => {
    if (!confirm("Finalizar esta turma? Ela será movida para o histórico.")) return;
    try {
      await query("turmas", { method: "PATCH", qs: `?id=eq.${id}`, body: { finalizada: true } });
      carregarDados();
    } catch (err) { alert("Erro: " + err.message); }
  };

  const reativarTurma = async (id) => {
    try {
      await query("turmas", { method: "PATCH", qs: `?id=eq.${id}`, body: { finalizada: false } });
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
  const turmasAtivas = turmas.filter((t) => !t.finalizada);
  const turmasFinalizadas = turmas.filter((t) => t.finalizada);

  // --- Dashboard helpers ---
  const hoje = todayStr();
  const aulasHoje = aulas.filter((a) => a.data_aula === hoje);
  const checkinsHoje = checkins.filter((c) => {
    const aulaHoje = aulasHoje.find((a) => a.id === c.aula_id);
    return !!aulaHoje;
  });

  // --- Copiar link ---
  const copiarLink = (turmaId) => {
    const link = `${window.location.origin}/c/${turmaId}`;
    navigator.clipboard.writeText(link).then(() => alert("Link copiado!\n\n" + link)).catch(() => {
      prompt("Copie o link abaixo:", link);
    });
  };

  // --- Template WhatsApp ---
  const copiarWhatsApp = (turmaId) => {
    const turma = turmas.find((t) => t.id === turmaId);
    if (!turma) return;
    const link = `${window.location.origin}/c/${turmaId}`;
    const aulaHoje = aulas.find((a) => a.turma_id === turmaId && a.data_aula === hoje);
    const msg = aulaHoje
      ? `📚 *${turma.curso} — ${turma.nome}*\n\n✅ Hora do check-in! Registre sua presença na aula de hoje:\n\n👉 ${link}\n\nÉ rápido: abra o link, digite seu celular e confirme. Bom curso! 🚀`
      : `📚 *${turma.curso} — ${turma.nome}*\n\nLink de check-in para a próxima aula:\n\n👉 ${link}\n\nAbra no dia da aula, digite seu celular e confirme sua presença. 📱`;
    navigator.clipboard.writeText(msg).then(() => alert("Mensagem copiada! Cole no WhatsApp.")).catch(() => prompt("Copie:", msg));
  };

  // --- Google Calendar ---
  const addToCalendar = (turmaId) => {
    const turma = turmas.find((t) => t.id === turmaId);
    if (!turma) return;
    const aulasT = aulasDaTurma(turmaId);
    if (!aulasT.length) { alert("Nenhuma aula cadastrada."); return; }
    const hi = turma.horario_inicio || "19:00";
    const hf = turma.horario_fim || "21:00";

    // Open each event in a new tab
    aulasT.forEach((aula, i) => {
      const [y, m, d] = aula.data_aula.split("-");
      const startDate = `${y}${m}${d}T${hi.replace(":", "")}00`;
      const endDate = `${y}${m}${d}T${hf.replace(":", "")}00`;
      const title = encodeURIComponent(`${turma.curso} — Aula ${i + 1}${aula.descricao ? " (" + aula.descricao + ")" : ""}`);
      const details = encodeURIComponent(`${turma.nome}\nCheck-in: ${window.location.origin}/c/${turmaId}`);
      const location = encodeURIComponent("João Pessoa — PB");
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${details}&location=${location}&ctz=America/Recife`;

      setTimeout(() => window.open(url, "_blank"), i * 500);
    });
    alert(`${aulasT.length} aula(s) sendo adicionadas ao Google Calendar. Confirme cada uma na aba que abrir.`);
  };

  // --- Lembrete de aula por e-mail ---
  const enviarLembrete = async (turmaId, dataAula) => {
    const turma = turmas.find((t) => t.id === turmaId);
    if (!turma) return;
    const alunosT = alunosDaTurma(turmaId);
    const comEmail = alunosT.filter((a) => a.email);
    if (!comEmail.length) { alert("Nenhum aluno com e-mail nessa turma."); return; }
    const aula = aulas.find((a) => a.turma_id === turmaId && a.data_aula === dataAula);
    const link = `${window.location.origin}/c/${turmaId}`;

    const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    const [y, m, d] = dataAula.split("-");
    const dataFormatada = `${parseInt(d)} de ${MESES[parseInt(m)-1]}`;
    const diaSemana = weekday(dataAula);

    if (!confirm(`Enviar lembrete de aula (${dataFormatada}) para ${comEmail.length} aluno(s)?`)) return;
    setGerando(true);
    let ok = 0;
    for (const al of comEmail) {
      try {
        await fetch("/api/enviar-certificado", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: al.email,
            nomeAluno: al.nome,
            nomeCurso: turma.curso,
            codigo: "__lembrete__",
            pdfBase64: null,
            assunto: `Lembrete: Aula de ${turma.curso} — ${dataFormatada}`,
            htmlCustom: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1A18;padding:40px 30px;border-radius:8px;"><div style="text-align:center;margin-bottom:30px;"><h1 style="color:#C8A96E;font-size:24px;margin:0;">Anderson Cursos</h1></div><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,110,0.15);border-radius:8px;padding:24px;"><p style="color:#F1EFE8;font-size:16px;margin:0 0 12px;">Olá, <strong>${al.nome}</strong>! 👋</p><p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Lembrete: sua aula de <strong style="color:#C8A96E;">${turma.curso}</strong> é <strong style="color:#F1EFE8;">${diaSemana}, ${dataFormatada}</strong>.</p>${aula?.descricao ? `<p style="color:#888;font-size:13px;margin:0 0 16px;">${aula.descricao}</p>` : ""}<div style="text-align:center;margin:20px 0;"><a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#C8A96E,#b8954e);color:#1A1A18;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px;">📱 FAZER CHECK-IN</a></div><p style="color:#666;font-size:12px;margin:0;">Ou acesse: ${link}</p></div><div style="text-align:center;padding-top:16px;border-top:1px solid rgba(200,169,110,0.1);margin-top:20px;"><p style="color:#666;font-size:11px;margin:0;">Anderson Cursos e Treinamentos · João Pessoa — PB</p></div></div>`,
          }),
        });
        ok++;
      } catch {}
    }
    setGerando(false);
    alert(`${ok}/${comEmail.length} lembretes enviados!`);
  };

  // --- Parabéns 100% presença ---
  const enviarParabens = async (turmaId) => {
    const turma = turmas.find((t) => t.id === turmaId);
    if (!turma) return;
    const aulasT = aulasDaTurma(turmaId);
    const alunosT = alunosDaTurma(turmaId);
    const com100 = alunosT.filter((al) => {
      if (!al.email) return false;
      const pres = aulasT.filter((a) => temCheckin(al.id, a.id)).length;
      return pres === aulasT.length && aulasT.length > 0;
    });
    if (!com100.length) { alert("Nenhum aluno com 100% de presença e e-mail cadastrado."); return; }
    if (!confirm(`Enviar parabéns para ${com100.length} aluno(s) com 100% de presença?`)) return;
    setGerando(true);
    let ok = 0;
    for (const al of com100) {
      try {
        await fetch("/api/enviar-certificado", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: al.email, nomeAluno: al.nome, nomeCurso: turma.curso,
            codigo: "__parabens__", pdfBase64: null,
            assunto: `Parabéns! 100% de presença em ${turma.curso} 🏆`,
            htmlCustom: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1A18;padding:40px 30px;border-radius:8px;"><div style="text-align:center;margin-bottom:30px;"><h1 style="color:#C8A96E;font-size:24px;margin:0;">Anderson Cursos</h1></div><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,110,0.15);border-radius:8px;padding:24px;text-align:center;"><div style="font-size:60px;margin-bottom:16px;">🏆</div><p style="color:#F1EFE8;font-size:20px;font-weight:700;margin:0 0 12px;">Parabéns, ${al.nome}!</p><p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Você atingiu <strong style="color:#2ecc71;">100% de presença</strong> no curso <strong style="color:#C8A96E;">${turma.curso}</strong>!</p><p style="color:#999;font-size:13px;line-height:1.6;margin:0;">Seu comprometimento e dedicação são admiráveis. Continue assim! Seu certificado será emitido em breve.</p></div><div style="text-align:center;padding-top:16px;border-top:1px solid rgba(200,169,110,0.1);margin-top:20px;"><p style="color:#666;font-size:11px;margin:0;">Anderson Cursos e Treinamentos · João Pessoa — PB</p></div></div>`,
          }),
        });
        ok++;
      } catch {}
    }
    setGerando(false);
    alert(`${ok}/${com100.length} mensagens de parabéns enviadas!`);
  };

  // --- Email genérico helper ---
  const enviarEmailGenerico = async (to, nome, curso, assunto, html) => {
    return fetch("/api/enviar-certificado", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, nomeAluno: nome, nomeCurso: curso, codigo: "__custom__", pdfBase64: null, assunto, htmlCustom: html }),
    });
  };

  // --- Notificação de falta ---
  const notificarFaltas = async (turmaId, dataAula) => {
    const turma = turmas.find((t) => t.id === turmaId);
    if (!turma) return;
    const aula = aulas.find((a) => a.turma_id === turmaId && a.data_aula === dataAula);
    if (!aula) return;
    const alunosT = alunosDaTurma(turmaId);
    const faltaram = alunosT.filter((al) => al.email && !checkins.some((c) => c.aluno_id === al.id && c.aula_id === aula.id));
    if (!faltaram.length) { alert("Todos os alunos com e-mail estiveram presentes!"); return; }
    if (!confirm(`Enviar notificação de falta para ${faltaram.length} aluno(s)?`)) return;

    const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    const [y, m, d] = dataAula.split("-");
    const dataF = `${parseInt(d)} de ${MESES[parseInt(m)-1]}`;
    const link = `${window.location.origin}/c/${turmaId}`;

    setGerando(true); let ok = 0;
    for (const al of faltaram) {
      try {
        await enviarEmailGenerico(al.email, al.nome, turma.curso,
          `Sentimos sua falta na aula de ${turma.curso} 😢`,
          `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1A18;padding:40px 30px;border-radius:8px;">
            <div style="text-align:center;margin-bottom:30px;"><h1 style="color:#C8A96E;font-size:24px;margin:0;">Anderson Cursos</h1></div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,110,0.15);border-radius:8px;padding:24px;">
              <p style="color:#F1EFE8;font-size:16px;margin:0 0 12px;">Olá, <strong>${al.nome}</strong>!</p>
              <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Notamos que você não esteve presente na aula de <strong style="color:#C8A96E;">${turma.curso}</strong> do dia <strong style="color:#F1EFE8;">${dataF}</strong>.</p>
              <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Sabemos que imprevistos acontecem! Mas lembre-se que a frequência é importante para o seu certificado de conclusão.</p>
              <div style="background:rgba(241,196,15,0.08);border:1px solid rgba(241,196,15,0.2);border-radius:8px;padding:14px;margin-bottom:16px;">
                <p style="color:#f1c40f;font-size:13px;font-weight:600;margin:0;">⚠️ Sua presença conta para a emissão do certificado. Não perca as próximas aulas!</p>
              </div>
              <p style="color:#999;font-size:13px;line-height:1.6;margin:0;">Dúvidas? Fale conosco: <strong style="color:#F1EFE8;">(83) 99658-4198</strong></p>
            </div>
            <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(200,169,110,0.1);margin-top:20px;"><p style="color:#666;font-size:11px;margin:0;">Anderson Cursos e Treinamentos · João Pessoa — PB</p></div>
          </div>`
        );
        ok++;
      } catch {}
    }
    setGerando(false);
    alert(`${ok}/${faltaram.length} notificações de falta enviadas!`);
  };

  // --- Sequência pós-curso ---
  const enviarSequenciaPosCurso = async (turmaId, etapa) => {
    const turma = turmas.find((t) => t.id === turmaId);
    if (!turma) return;
    const alunosT = alunosDaTurma(turmaId);
    const comEmail = alunosT.filter((a) => a.email);
    if (!comEmail.length) { alert("Nenhum aluno com e-mail."); return; }

    const etapas = {
      depoimento: {
        assunto: `Conte sua experiência no curso ${turma.curso} ⭐`,
        html: (nome) => `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1A18;padding:40px 30px;border-radius:8px;">
          <div style="text-align:center;margin-bottom:30px;"><h1 style="color:#C8A96E;font-size:24px;margin:0;">Anderson Cursos</h1></div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,110,0.15);border-radius:8px;padding:24px;text-align:center;">
            <div style="font-size:48px;margin-bottom:16px;">⭐</div>
            <p style="color:#F1EFE8;font-size:16px;margin:0 0 12px;">Olá, <strong>${nome}</strong>!</p>
            <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Você concluiu o curso <strong style="color:#C8A96E;">${turma.curso}</strong> e gostaríamos muito de saber como foi sua experiência!</p>
            <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 20px;">Seu depoimento é muito importante para nós e ajuda outros profissionais a conhecerem nossos cursos.</p>
            <a href="https://wa.me/5583996584198?text=Ol%C3%A1%20Professor%20Anderson!%20Quero%20deixar%20meu%20depoimento%20sobre%20o%20curso%20${encodeURIComponent(turma.curso)}:" style="display:inline-block;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px;">💬 Enviar Depoimento pelo WhatsApp</a>
            <p style="color:#666;font-size:12px;margin-top:16px;">Basta clicar no botão acima e nos contar como foi!</p>
          </div>
          <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(200,169,110,0.1);margin-top:20px;"><p style="color:#666;font-size:11px;margin:0;">Anderson Cursos e Treinamentos · João Pessoa — PB</p></div>
        </div>`,
      },
      proximo_curso: {
        assunto: `Novos cursos disponíveis — Anderson Cursos 🚀`,
        html: (nome) => `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1A1A18;padding:40px 30px;border-radius:8px;">
          <div style="text-align:center;margin-bottom:30px;"><h1 style="color:#C8A96E;font-size:24px;margin:0;">Anderson Cursos</h1></div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,110,0.15);border-radius:8px;padding:24px;">
            <p style="color:#F1EFE8;font-size:16px;margin:0 0 12px;">Olá, <strong>${nome}</strong>! 👋</p>
            <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Que bom ter você como aluno(a) da Anderson Cursos! Você concluiu o curso <strong style="color:#C8A96E;">${turma.curso}</strong> e agora pode dar o próximo passo na sua carreira.</p>
            <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0 0 16px;">Confira nossos próximos cursos presenciais em João Pessoa:</p>
            <div style="background:rgba(200,169,110,0.08);border:1px solid rgba(200,169,110,0.2);border-radius:8px;padding:16px;margin-bottom:16px;">
              <p style="color:#C8A96E;font-size:13px;font-weight:700;margin:0 0 8px;">📚 Cursos disponíveis:</p>
              <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">• Meta Ads (Tráfego Pago)</p>
              <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">• Google Ads</p>
              <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">• Canva para Negócios</p>
              <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">• CapCut — Edição de Vídeos</p>
              <p style="color:#F1EFE8;font-size:13px;margin:0 0 4px;">• Fotografia com Celular</p>
              <p style="color:#F1EFE8;font-size:13px;margin:0;">• IA para Negócios</p>
            </div>
            <div style="text-align:center;margin:20px 0;">
              <a href="https://wa.me/5583996584198?text=Ol%C3%A1%20Professor!%20Tenho%20interesse%20em%20um%20novo%20curso.%20Vim%20do%20e-mail." style="display:inline-block;background:linear-gradient(135deg,#C8A96E,#b8954e);color:#1A1A18;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px;">🚀 Quero me matricular</a>
            </div>
            <p style="color:#999;font-size:12px;margin:0;text-align:center;">Ex-alunos têm condições especiais!</p>
          </div>
          <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(200,169,110,0.1);margin-top:20px;"><p style="color:#666;font-size:11px;margin:0;">Anderson Cursos e Treinamentos · João Pessoa — PB</p></div>
        </div>`,
      },
    };

    const e = etapas[etapa];
    if (!e) return;
    if (!confirm(`Enviar "${e.assunto}" para ${comEmail.length} aluno(s)?`)) return;
    setGerando(true); let ok = 0;
    for (const al of comEmail) {
      try { await enviarEmailGenerico(al.email, al.nome, turma.curso, e.assunto, e.html(al.nome)); ok++; } catch {}
    }
    setGerando(false);
    alert(`${ok}/${comEmail.length} e-mails enviados!`);
  };

  // --- Tabs ---
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "🏠" },
    { id: "turmas", label: "Turmas", icon: "📚" },
    { id: "alunos", label: "Alunos", icon: "👥" },
    { id: "relatorio", label: "Presença", icon: "📊" },
    { id: "certificados", label: "Certificados", icon: "📜" },
    { id: "relatorios", label: "Relatórios", icon: "📈" },
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
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#27ae60" : "#e74c3c" }} />
            <span style={{ color: "#777", fontSize: 11 }}>{connected ? "Supabase conectado" : "Não conectado"}</span>
          </div>
          {onLogout && (
            <button onClick={onLogout} style={{
              padding: "5px 12px", fontSize: 10, fontFamily: "'Montserrat', sans-serif",
              fontWeight: 600, background: "rgba(255,255,255,0.05)", color: "#888",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer",
            }}>Sair</button>
          )}
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

        {/* ========== DASHBOARD ========== */}
        {tab === "dashboard" && (
          <div>
            <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Dashboard</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
              {[
                { label: "Turmas Ativas", value: turmasAtivas.length, icon: "📚", color: "#C8A96E" },
                { label: "Aulas Hoje", value: aulasHoje.length, icon: "📅", color: "#3498db" },
                { label: "Total de Alunos", value: alunos.length, icon: "👥", color: "#2ecc71" },
                { label: "Check-ins Hoje", value: checkinsHoje.length, icon: "✅", color: "#27ae60" },
              ].map((card, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.025)", borderRadius: 12, padding: "20px 18px",
                  border: "1px solid rgba(200,169,110,0.08)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{card.icon}</span>
                    <span style={{ color: card.color, fontSize: 28, fontWeight: 800 }}>{card.value}</span>
                  </div>
                  <p style={{ color: "#888", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>{card.label}</p>
                </div>
              ))}
            </div>

            {/* Aulas do dia */}
            {aulasHoje.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📅 Aulas de Hoje ({fmtDateFull(hoje)})</h3>
                {aulasHoje.map((aula) => {
                  const turma = turmas.find((t) => t.id === aula.turma_id);
                  const alunosT = alunosDaTurma(aula.turma_id);
                  const presentes = alunosT.filter((al) => checkins.some((c) => c.aluno_id === al.id && c.aula_id === aula.id)).length;
                  return (
                    <div key={aula.id} style={{
                      background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "14px 18px",
                      border: "1px solid rgba(200,169,110,0.08)", marginBottom: 8,
                      display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
                    }}>
                      <div>
                        <span style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 14 }}>{turma?.nome}</span>
                        <span style={{ color: "#C8A96E", fontSize: 12, marginLeft: 8 }}>{turma?.curso}</span>
                        {aula.descricao && <span style={{ color: "#666", fontSize: 11, marginLeft: 8 }}>— {aula.descricao}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: presentes > 0 ? "#2ecc71" : "#555", fontSize: 13, fontWeight: 700 }}>{presentes}/{alunosT.length}</span>
                        <button onClick={() => copiarWhatsApp(aula.turma_id)} style={{ padding: "5px 12px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(37,211,102,0.12)", color: "#25d366", border: "1px solid rgba(37,211,102,0.25)", borderRadius: 6, cursor: "pointer" }}>💬 WhatsApp</button>
                        <button onClick={() => copiarLink(aula.turma_id)} style={{ padding: "5px 12px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(200,169,110,0.12)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.25)", borderRadius: 6, cursor: "pointer" }}>📋 Link</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Turmas ativas resumo */}
            {turmasAtivas.length > 0 && (
              <div>
                <h3 style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📚 Turmas Ativas</h3>
                {turmasAtivas.map((t) => {
                  const aulasT = aulasDaTurma(t.id);
                  const alunosT = alunosDaTurma(t.id);
                  const proxAula = aulasT.find((a) => a.data_aula >= hoje);
                  const aulaOntem = aulasT.filter((a) => a.data_aula < hoje).pop();
                  const com100 = alunosT.filter((al) => { const p = aulasT.filter((a) => temCheckin(al.id, a.id)).length; return p === aulasT.length && aulasT.length > 0; });
                  return (
                    <div key={t.id} style={{
                      background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: "12px 18px",
                      border: "1px solid rgba(200,169,110,0.08)", marginBottom: 6,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <span style={{ color: "#F1EFE8", fontWeight: 700, fontSize: 13 }}>{t.nome}</span>
                          <span style={{ color: "#888", fontSize: 11, marginLeft: 8 }}>{t.curso} · {alunosT.length} alunos · {aulasT.length} aulas</span>
                        </div>
                        {proxAula && <span style={{ color: "#555", fontSize: 11 }}>Próxima: {fmtDate(proxAula.data_aula)} ({weekday(proxAula.data_aula)})</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {proxAula && (
                          <button onClick={() => enviarLembrete(t.id, proxAula.data_aula)} disabled={gerando} style={{ padding: "5px 12px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(52,152,219,0.12)", color: "#3498db", border: "1px solid rgba(52,152,219,0.25)", borderRadius: 6, cursor: "pointer" }}>
                            📧 Lembrete próxima aula
                          </button>
                        )}
                        {aulaOntem && (
                          <button onClick={() => notificarFaltas(t.id, aulaOntem.data_aula)} disabled={gerando} style={{ padding: "5px 12px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(231,76,60,0.12)", color: "#e74c3c", border: "1px solid rgba(231,76,60,0.25)", borderRadius: 6, cursor: "pointer" }}>
                            😢 Notificar faltas ({fmtDate(aulaOntem.data_aula)})
                          </button>
                        )}
                        {com100.length > 0 && (
                          <button onClick={() => enviarParabens(t.id)} disabled={gerando} style={{ padding: "5px 12px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(241,196,15,0.12)", color: "#f1c40f", border: "1px solid rgba(241,196,15,0.25)", borderRadius: 6, cursor: "pointer" }}>
                            🏆 Parabéns 100% ({com100.length})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}


            {/* Charts */}
            {turmas.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <h3 style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>📊 Visão Geral</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                  {/* Alunos por turma */}
                  <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(200,169,110,0.08)" }}>
                    <p style={{ color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>Alunos por turma</p>
                    {turmas.map((t) => {
                      const count = alunosDaTurma(t.id).length;
                      const max = Math.max(...turmas.map((x) => alunosDaTurma(x.id).length), 1);
                      const pct = (count / max) * 100;
                      return (
                        <div key={t.id} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: "#bbb", fontSize: 11 }}>{t.nome}</span>
                            <span style={{ color: "#C8A96E", fontSize: 11, fontWeight: 700 }}>{count}</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }}>
                            <div style={{ height: 8, borderRadius: 4, background: "linear-gradient(90deg, #C8A96E, #e0c68a)", width: `${pct}%`, transition: "width 0.5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Presença média por turma */}
                  <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(200,169,110,0.08)" }}>
                    <p style={{ color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>Presença média por turma</p>
                    {turmas.map((t) => {
                      const aulasT = aulasDaTurma(t.id);
                      const alunosT = alunosDaTurma(t.id);
                      let media = 0;
                      if (aulasT.length && alunosT.length) {
                        const totalPossivel = aulasT.length * alunosT.length;
                        const totalPresente = alunosT.reduce((sum, al) => sum + aulasT.filter((a) => temCheckin(al.id, a.id)).length, 0);
                        media = Math.round((totalPresente / totalPossivel) * 100);
                      }
                      const barColor = media >= 80 ? "#2ecc71" : media >= 50 ? "#f39c12" : "#e74c3c";
                      return (
                        <div key={t.id} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: "#bbb", fontSize: 11 }}>{t.nome}</span>
                            <span style={{ color: barColor, fontSize: 11, fontWeight: 700 }}>{media}%</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }}>
                            <div style={{ height: 8, borderRadius: 4, background: barColor, width: `${media}%`, transition: "width 0.5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Evolução mensal */}
                  <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(200,169,110,0.08)", gridColumn: "1 / 3" }}>
                    <p style={{ color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>Evolução mensal — Alunos matriculados</p>
                    {(() => {
                      const NOMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
                      const meses = {};
                      alunos.forEach((a) => {
                        const d = new Date(a.criado_em);
                        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
                        const label = `${NOMES[d.getMonth()]}/${d.getFullYear()}`;
                        if (!meses[key]) meses[key] = { label, count: 0 };
                        meses[key].count++;
                      });
                      const sorted = Object.entries(meses).sort((a,b) => a[0].localeCompare(b[0]));
                      if (!sorted.length) return <p style={{ color: "#555", fontSize: 11 }}>Sem dados ainda.</p>;
                      const maxVal = Math.max(...sorted.map(([,v]) => v.count), 1);
                      return (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                          {sorted.map(([key, data]) => (
                            <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                              <span style={{ color: "#C8A96E", fontSize: 11, fontWeight: 700 }}>{data.count}</span>
                              <div style={{
                                width: "100%", maxWidth: 60, borderRadius: "6px 6px 0 0",
                                background: "linear-gradient(180deg, #C8A96E, #8a7040)",
                                height: `${(data.count / maxVal) * 80}px`,
                                minHeight: 4, transition: "height 0.5s",
                              }} />
                              <span style={{ color: "#888", fontSize: 9, fontWeight: 600 }}>{data.label}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Cursos mais populares */}
                  <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(200,169,110,0.08)", gridColumn: "1 / 3" }}>
                    <p style={{ color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>Cursos mais populares</p>
                    {(() => {
                      const cursos = {};
                      turmas.forEach((t) => {
                        if (!cursos[t.curso]) cursos[t.curso] = { turmas: 0, alunos: 0, certs: 0 };
                        cursos[t.curso].turmas++;
                        cursos[t.curso].alunos += alunos.filter((a) => a.turma_id === t.id).length;
                        cursos[t.curso].certs += certificados.filter((c) => c.turma_id === t.id).length;
                      });
                      const sorted = Object.entries(cursos).sort((a,b) => b[1].alunos - a[1].alunos);
                      const maxA = Math.max(...sorted.map(([,v]) => v.alunos), 1);
                      const colors = ["#C8A96E", "#3498db", "#2ecc71", "#e74c3c", "#9b59b6", "#f39c12"];
                      return sorted.map(([curso, data], i) => (
                        <div key={curso} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: "#bbb", fontSize: 11 }}>{curso}</span>
                            <span style={{ color: "#888", fontSize: 10 }}>{data.turmas} turma(s) · <span style={{ color: colors[i % colors.length], fontWeight: 700 }}>{data.alunos} alunos</span></span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }}>
                            <div style={{ height: 8, borderRadius: 4, background: colors[i % colors.length], width: `${(data.alunos / maxA) * 100}%`, transition: "width 0.5s" }} />
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {turmasFinalizadas.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ color: "#888", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📁 Histórico ({turmasFinalizadas.length})</h3>
                {turmasFinalizadas.map((t) => (
                  <div key={t.id} style={{
                    background: "rgba(255,255,255,0.015)", borderRadius: 10, padding: "12px 18px",
                    border: "1px solid rgba(255,255,255,0.04)", marginBottom: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ color: "#666", fontSize: 12 }}>{t.nome} — {t.curso}</span>
                      <button onClick={() => reativarTurma(t.id)} style={{
                        padding: "4px 10px", fontSize: 10, fontFamily: "'Montserrat', sans-serif",
                        fontWeight: 600, background: "transparent", color: "#555",
                        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, cursor: "pointer",
                      }}>Reativar</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => enviarSequenciaPosCurso(t.id, "depoimento")} disabled={gerando} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "rgba(241,196,15,0.08)", color: "#f1c40f", border: "1px solid rgba(241,196,15,0.15)", borderRadius: 6, cursor: "pointer" }}>⭐ Pedir Depoimento</button>
                      <button onClick={() => enviarSequenciaPosCurso(t.id, "proximo_curso")} disabled={gerando} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "rgba(200,169,110,0.08)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.15)", borderRadius: 6, cursor: "pointer" }}>🚀 Oferta Próximo Curso</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========== TURMAS ========== */}
        {tab === "turmas" && (
          <div>
            <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Nova Turma</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div><label style={lbl}>Nome da Turma</label><input placeholder="Ex: Turma 15 — Manhã" style={inp} value={novaTurma.nome} onChange={(e) => setNovaTurma({ ...novaTurma, nome: e.target.value })} /></div>
              <div><label style={lbl}>Curso</label><input placeholder="Ex: Meta Ads Completo" style={inp} value={novaTurma.curso} onChange={(e) => setNovaTurma({ ...novaTurma, curso: e.target.value })} /></div>
              <div><label style={lbl}>Formato da Turma</label><select style={{ ...inp, appearance: "auto" }} value={novaTurma.carga_horaria} onChange={(e) => {
                const v = e.target.value;
                if (v === "30-noite") setNovaTurma({ ...novaTurma, carga_horaria: v, horario_inicio: "18:00", horario_fim: "21:00" });
                else if (v === "30-tarde") setNovaTurma({ ...novaTurma, carga_horaria: v, horario_inicio: "14:00", horario_fim: "17:00" });
                else setNovaTurma({ ...novaTurma, carga_horaria: v, horario_inicio: "09:00", horario_fim: "18:00" });
              }}><option value="30-noite">30h — Semana (Noite: 18h às 21h)</option><option value="30-tarde">30h — Semana (Tarde: 14h às 17h)</option><option value="18">18h — Fim de semana (Sáb/Dom)</option></select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              {isWeekend ? (
                <div style={{ gridColumn: "1 / 3" }}>
                  <label style={lbl}>🕐 Horários (Fim de semana)</label>
                  <div style={{ ...inp, color: "#C8A96E", fontSize: 12, lineHeight: 1.6, background: "rgba(200,169,110,0.06)" }}>
                    Manhã: 09:00 às 12:00 · Check-in: 09:00-12:00<br/>
                    Tarde: 14:30 às 18:00 · Check-in: 14:30-16:00<br/>
                    <span style={{ color: "#888", fontSize: 11 }}>4 check-ins por turma (2 por dia × 2 dias)</span>
                  </div>
                </div>
              ) : (
                <>
                  <div><label style={lbl}>🕐 Horário Início (check-in)</label><input type="time" style={inp} value={novaTurma.horario_inicio} onChange={(e) => setNovaTurma({ ...novaTurma, horario_inicio: e.target.value })} /></div>
                  <div><label style={lbl}>🕐 Horário Fim (check-in)</label><input type="time" style={inp} value={novaTurma.horario_fim} onChange={(e) => setNovaTurma({ ...novaTurma, horario_fim: e.target.value })} /></div>
                </>
              )}
              <div><label style={lbl}>📍 Local da Aula</label><button onClick={() => {
                navigator.geolocation.getCurrentPosition((pos) => {
                  setNovaTurma({ ...novaTurma, local_lat: pos.coords.latitude, local_lng: pos.coords.longitude });
                  alert(`Localização capturada!\nLat: ${pos.coords.latitude.toFixed(6)}\nLng: ${pos.coords.longitude.toFixed(6)}\n\nO aluno só poderá fazer check-in num raio de 200m deste ponto.`);
                }, () => alert("Permita o acesso à localização."));
              }} style={{ ...inp, cursor: "pointer", textAlign: "center", color: novaTurma.local_lat ? "#2ecc71" : "#C8A96E", background: novaTurma.local_lat ? "rgba(39,174,96,0.1)" : "rgba(200,169,110,0.08)", border: novaTurma.local_lat ? "1px solid rgba(39,174,96,0.25)" : "1px solid rgba(200,169,110,0.2)" }}>{novaTurma.local_lat ? `✅ Capturada (${novaTurma.local_lat.toFixed(4)}, ${novaTurma.local_lng.toFixed(4)})` : "📍 Capturar minha localização"}</button></div>
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
                          <span style={{ color: "#555", fontSize: 11 }}>{aulasT.length} aulas · {getCH(t.carga_horaria)}h</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button onClick={(e) => { e.stopPropagation(); copiarLink(t.id); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(200,169,110,0.12)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.25)", borderRadius: 8, cursor: "pointer" }}>
                            📋 LINK
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); copiarWhatsApp(t.id); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(37,211,102,0.12)", color: "#25d366", border: "1px solid rgba(37,211,102,0.25)", borderRadius: 8, cursor: "pointer" }}>
                            💬 WHATSAPP
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); addToCalendar(t.id); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(66,133,244,0.12)", color: "#4285f4", border: "1px solid rgba(66,133,244,0.25)", borderRadius: 8, cursor: "pointer" }}>
                            📅 CALENDAR
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/c/${t.id}`); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(39,174,96,0.12)", color: "#2ecc71", border: "1px solid rgba(39,174,96,0.25)", borderRadius: 8, cursor: "pointer" }}>
                            📱 TESTAR
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); finalizarTurma(t.id); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(52,152,219,0.12)", color: "#3498db", border: "1px solid rgba(52,152,219,0.25)", borderRadius: 8, cursor: "pointer" }}>
                            📁 FINALIZAR
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); excluirTurma(t.id); }}
                            style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(231,76,60,0.08)", color: "#e74c3c", border: "1px solid rgba(231,76,60,0.2)", borderRadius: 8, cursor: "pointer" }}>
                            🗑
                          </button>
                        </div>
                      </div>
                      {expanded && (
                        <div style={{ padding: "0 18px 14px" }}>
                          {aulasT.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                              {aulasT.map((a, i) => (
                                <div key={a.id} style={{ background: "rgba(200,169,110,0.06)", padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(200,169,110,0.1)", fontSize: 11 }}>
                                  <span style={{ color: "#C8A96E", fontWeight: 700 }}>Aula {i + 1}</span>
                                  <span style={{ color: "#999", marginLeft: 6 }}>{fmtDate(a.data_aula)} ({weekday(a.data_aula)})</span>
                                  {a.descricao && <span style={{ color: "#666", marginLeft: 4 }}>— {a.descricao}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ color: "#555", fontSize: 10 }}>🕐 Check-in: {t.horario_inicio || "—"} às {t.horario_fim || "—"}</span>
                            <span style={{ color: "#555", fontSize: 10 }}>📍 {t.local_lat ? `Geoloc. ativa (${t.local_raio || 200}m)` : "Sem geolocalização"}</span>
                            {!t.local_lat && (
                              <button onClick={(e) => { e.stopPropagation(); navigator.geolocation.getCurrentPosition(async (pos) => {
                                try {
                                  await query("turmas", { method: "PATCH", qs: `?id=eq.${t.id}`, body: { local_lat: pos.coords.latitude, local_lng: pos.coords.longitude } });
                                  carregarDados();
                                  alert("Localização configurada!");
                                } catch (err) { alert("Erro: " + err.message); }
                              }, () => alert("Permita o acesso à localização.")); }}
                                style={{ padding: "3px 10px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "rgba(200,169,110,0.08)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.15)", borderRadius: 6, cursor: "pointer" }}>📍 Definir local</button>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                            <span style={{ color: t.manual_url ? "#2ecc71" : "#555", fontSize: 10 }}>📄 {t.manual_url ? "Manual anexado ✓" : "Sem manual"}</span>
                            <label style={{ padding: "3px 10px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: t.manual_url ? "rgba(39,174,96,0.08)" : "rgba(200,169,110,0.08)", color: t.manual_url ? "#2ecc71" : "#C8A96E", border: t.manual_url ? "1px solid rgba(39,174,96,0.15)" : "1px solid rgba(200,169,110,0.15)", borderRadius: 6, cursor: "pointer" }}>
                              {t.manual_url ? "📄 Trocar manual" : "📄 Upload manual (PDF)"}
                              <input type="file" accept=".pdf" style={{ display: "none" }} onChange={async (e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                if (file.size > 10 * 1024 * 1024) { alert("Arquivo muito grande (máx 10MB)."); return; }
                                try {
                                  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
                                  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
                                  const fileName = `manual_${t.id}_${Date.now()}.pdf`;
                                  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/manuais/${fileName}`, {
                                    method: "POST",
                                    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/pdf" },
                                    body: file,
                                  });
                                  if (!uploadRes.ok) throw new Error("Falha no upload");
                                  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/manuais/${fileName}`;
                                  await query("turmas", { method: "PATCH", qs: `?id=eq.${t.id}`, body: { manual_url: publicUrl } });
                                  carregarDados();
                                  alert("Manual enviado com sucesso! ✅");
                                } catch (err) { alert("Erro: " + err.message); }
                                e.target.value = "";
                              }} />
                            </label>
                            {t.manual_url && <a href={t.manual_url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#3498db", textDecoration: "none" }}>👁 Ver manual</a>}
                          </div>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
              <div><label style={lbl}>Nome Completo</label><input placeholder="Maria Silva" style={inp} value={novoAluno.nome} onChange={(e) => setNovoAluno({ ...novoAluno, nome: e.target.value })} /></div>
              <div><label style={lbl}>CPF</label><input placeholder="000.000.000-00" style={inp} value={novoAluno.cpf} onChange={(e) => {
                let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
                else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
                else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
                setNovoAluno({ ...novoAluno, cpf: v });
              }} /></div>
              <div><label style={lbl}>Celular (WhatsApp)</label><input placeholder="(83) 99999-9999" type="tel" style={inp} value={novoAluno.celular} onChange={(e) => setNovoAluno({ ...novoAluno, celular: formatPhone(e.target.value) })} /></div>
              <div><label style={lbl}>E-mail</label><input placeholder="aluno@email.com" type="email" style={inp} value={novoAluno.email} onChange={(e) => setNovoAluno({ ...novoAluno, email: e.target.value })} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
              <div><label style={lbl}>Endereço (Rua, nº, complemento)</label><input placeholder="Rua João Pessoa, 123 - Apt 201" style={inp} value={novoAluno.endereco} onChange={(e) => setNovoAluno({ ...novoAluno, endereco: e.target.value })} /></div>
              <div><label style={lbl}>Bairro</label><input placeholder="Centro" style={inp} value={novoAluno.bairro} onChange={(e) => setNovoAluno({ ...novoAluno, bairro: e.target.value })} /></div>
              <div><label style={lbl}>Cidade</label><input style={inp} value={novoAluno.cidade} onChange={(e) => setNovoAluno({ ...novoAluno, cidade: e.target.value })} /></div>
              <div><label style={lbl}>Estado</label><input style={inp} value={novoAluno.estado} onChange={(e) => setNovoAluno({ ...novoAluno, estado: e.target.value })} maxLength={2} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div><label style={lbl}>Turma</label>
                <select style={{ ...inp, appearance: "auto" }} value={novoAluno.turma_id} onChange={(e) => setNovoAluno({ ...novoAluno, turma_id: e.target.value })}>
                  <option value="">Selecione...</option>
                  {turmas.filter((t) => !t.finalizada).map((t) => <option key={t.id} value={t.id}>{t.nome} — {t.curso}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Pagamento</label>
                <select style={{ ...inp, appearance: "auto" }} value={novoAluno.pag_forma} onChange={(e) => setNovoAluno({ ...novoAluno, pag_forma: e.target.value })}>
                  <option value="pix">PIX (à vista)</option>
                  <option value="cartao">Cartão (parcelado)</option>
                </select>
              </div>
              <div><label style={lbl}>{novoAluno.pag_forma === "pix" ? "Valor (PIX)" : "Valor Total"}</label><input placeholder="R$ 497,00" style={inp} value={novoAluno.pag_valor} onChange={(e) => setNovoAluno({ ...novoAluno, pag_valor: e.target.value })} /></div>
              {novoAluno.pag_forma === "cartao" && (
                <>
                  <div><label style={lbl}>Parcelas</label><input placeholder="3" type="number" style={inp} value={novoAluno.pag_parcelas} onChange={(e) => setNovoAluno({ ...novoAluno, pag_parcelas: e.target.value })} /></div>
                  <div><label style={lbl}>Valor Parcela</label><input placeholder="R$ 165,67" style={inp} value={novoAluno.pag_valor_parcela} onChange={(e) => setNovoAluno({ ...novoAluno, pag_valor_parcela: e.target.value })} /></div>
                </>
              )}
            </div>
            <button style={btnP} onClick={criarAluno}>+ CADASTRAR ALUNO</button>

            <h3 style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 700, marginTop: 36, marginBottom: 14 }}>Alunos ({alunos.length})</h3>
            {alunos.length === 0 ? (
              <p style={{ color: "#555", fontSize: 13 }}>Nenhum aluno cadastrado.</p>
            ) : (
              <div>
                {turmas.map((t) => {
                  const alunosT = alunos.filter((a) => a.turma_id === t.id);
                  if (!alunosT.length) return null;
                  return (
                    <div key={t.id} style={{ marginBottom: 24 }}>
                      <div style={{ padding: "10px 16px", background: "rgba(200,169,110,0.06)", borderRadius: "10px 10px 0 0", border: "1px solid rgba(200,169,110,0.1)", borderBottom: "none" }}>
                        <span style={{ color: "#C8A96E", fontSize: 12, fontWeight: 700 }}>{t.nome}</span>
                        <span style={{ color: "#888", fontSize: 11, marginLeft: 8 }}>{t.curso} · {alunosT.length} aluno(s)</span>
                      </div>
                      <div style={{ overflowX: "auto", border: "1px solid rgba(200,169,110,0.1)", borderRadius: "0 0 10px 10px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>{["Nome", "Celular", "E-mail", "Contrato", ""].map((h) => (
                              <th key={h || "acoes"} style={{ textAlign: "left", padding: "8px 16px", color: "#666", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {alunosT.map((a) => {
                              const isEdit = editando?.id === a.id;
                              const contrato = contratos.find((c) => c.aluno_id === a.id);
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
                                <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                  {contrato ? (
                                    contrato.status === "assinado"
                                      ? <span style={{ color: "#2ecc71", fontSize: 11, fontWeight: 700 }}>🟢 Assinado</span>
                                      : <a href={contrato.link_assinatura || "#"} target="_blank" rel="noopener" style={{ color: "#f39c12", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>🟡 Pendente</a>
                                  ) : <span style={{ color: "#555", fontSize: 11 }}>—</span>}
                                </td>
                                <td style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)", whiteSpace: "nowrap" }}>
                                  {isEdit ? (
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button onClick={salvarEdicao} style={{ padding: "5px 12px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, background: "rgba(39,174,96,0.15)", color: "#2ecc71", border: "1px solid rgba(39,174,96,0.3)", borderRadius: 6, cursor: "pointer" }}>✓ Salvar</button>
                                      <button onClick={() => setEditando(null)} style={{ padding: "5px 10px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "transparent", color: "#888", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer" }}>✕</button>
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button onClick={() => setEditando({ id: a.id, nome: a.nome, celular: formatPhone(a.celular), email: a.email || "" })} style={{ padding: "5px 12px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "rgba(200,169,110,0.08)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.15)", borderRadius: 6, cursor: "pointer" }}>✏️ Editar</button>
                                      <button onClick={() => excluirAluno(a.id)} style={{ padding: "5px 10px", fontSize: 11, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "rgba(231,76,60,0.08)", color: "#e74c3c", border: "1px solid rgba(231,76,60,0.15)", borderRadius: 6, cursor: "pointer" }}>🗑</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
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
                                    <div onClick={() => toggleCheckin(al.id, a.id, turma.id)} style={{
                                      width: 26, height: 26, borderRadius: 6, margin: "0 auto",
                                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                                      background: ok ? "rgba(39,174,96,0.15)" : "rgba(255,255,255,0.03)",
                                      border: ok ? "1px solid rgba(39,174,96,0.3)" : "1px solid rgba(255,255,255,0.05)",
                                      color: ok ? "#2ecc71" : "#333",
                                      cursor: "pointer", transition: "all 0.15s",
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

            {previewCert && (
              <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPreviewCert(null)}>
                <div style={{ maxWidth: 900, width: "100%", background: "#1A1A18", borderRadius: 12, border: "1px solid rgba(200,169,110,0.2)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(200,169,110,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700 }}>Preview — {previewCert.nome_aluno}</span>
                    <button onClick={() => setPreviewCert(null)} style={{ background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer" }}>✕</button>
                  </div>
                  <div style={{ padding: 20, display: "flex", justifyContent: "center" }}>
                    <iframe id="cert-preview-iframe" style={{ width: "100%", height: 500, border: "none", borderRadius: 8, background: "#111" }} />
                  </div>
                  <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(200,169,110,0.1)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={async () => { const doc = await gerarCertificadoPDF({ nomeAluno: previewCert.nome_aluno, nomeCurso: previewCert.nome_curso, cargaHoraria: previewCert.carga_horaria, dataInicio: previewCert.data_inicio, dataFim: previewCert.data_fim, frequencia: previewCert.frequencia, codigo: previewCert.codigo, observacao: "" }); doc.save(`Certificado_${previewCert.nome_aluno.replace(/\s+/g, "_")}.pdf`); }} style={{ ...btnP, padding: "8px 18px", fontSize: 12 }}>📄 Baixar PDF</button>
                    <button onClick={() => setPreviewCert(null)} style={{ padding: "8px 18px", fontSize: 12, fontFamily: "'Montserrat', sans-serif", fontWeight: 600, background: "transparent", color: "#888", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer" }}>Fechar</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div><label style={lbl}>Turma</label><select style={{ ...inp, appearance: "auto" }} value={certTurma} onChange={(e) => { setCertTurma(e.target.value); const t = turmas.find((x) => x.id === e.target.value); if (t) setCertCarga(getCH(t.carga_horaria)); }}><option value="">Selecione a turma...</option>{turmas.map((t) => <option key={t.id} value={t.id}>{t.nome} — {t.curso} ({getCH(t.carga_horaria)}h)</option>)}</select></div>
              <div><label style={lbl}>Frequência Mínima (%)</label><input style={inp} value={certFreqMin} onChange={(e) => setCertFreqMin(e.target.value)} placeholder="Ex: 75" /></div>
            </div>

            {certTurma && (() => {
              const turma = turmas.find((t) => t.id === certTurma);
              const aulasT = aulasDaTurma(certTurma);
              const alunosT = alunosDaTurma(certTurma);
              if (!turma || !alunosT.length) return <p style={{ color: "#555", fontSize: 13 }}>Nenhum aluno nessa turma.</p>;
              const dataIni = aulasT.length ? aulasT[0].data_aula : "";
              const dataFin = aulasT.length ? aulasT[aulasT.length - 1].data_aula : "";
              const jaCerts = certificados.filter((c) => c.turma_id === certTurma);
              const freqMin = parseInt(certFreqMin) || 0;
              const alunosF = alunosT.map((al) => { const tot = aulasT.length; const pres = aulasT.filter((a) => temCheckin(al.id, a.id)).length; const freq = tot ? Math.round((pres/tot)*100) : 0; return { ...al, freq, ok: freq >= freqMin, jaCert: jaCerts.find((c) => c.aluno_id === al.id), pres, tot }; });
              const aptos = alunosF.filter((a) => a.ok && !a.jaCert);
              const reprov = alunosF.filter((a) => !a.ok && !a.jaCert);
              const mkP = (cert) => ({ nomeAluno: cert.nome_aluno, nomeCurso: cert.nome_curso, cargaHoraria: cert.carga_horaria, dataInicio: cert.data_inicio, dataFim: cert.data_fim, frequencia: cert.frequencia, codigo: cert.codigo, observacao: "" });

              const gerarTodos = async () => { if (!certCarga) { alert("Preencha a carga horária."); return; } if (!aptos.length) { alert("Nenhum aluno apto."); return; } setGerando(true); try { for (const al of aptos) { await query("certificados", { method: "POST", body: { codigo: gerarCodigo(), aluno_id: al.id, turma_id: certTurma, nome_aluno: al.nome, nome_curso: turma.curso, carga_horaria: certCarga, data_inicio: dataIni, data_fim: dataFin, frequencia: al.freq } }); } await carregarDados(); alert(`${aptos.length} certificado(s) gerado(s)!`); } catch (err) { alert("Erro: " + err.message); } setGerando(false); };
              const baixarPDF = async (cert) => { try { const doc = await gerarCertificadoPDF(mkP(cert)); doc.save(`Certificado_${cert.nome_aluno.replace(/\s+/g,"_")}.pdf`); } catch (err) { alert("Erro: " + err.message); } };
              const previewPDF = async (cert) => { try { const doc = await gerarCertificadoPDF(mkP(cert)); setPreviewCert(cert); setTimeout(() => { const el = document.getElementById("cert-preview-iframe"); if (el) el.src = doc.output("bloburl"); }, 100); } catch (err) { alert("Erro: " + err.message); } };
              const baixarZIP = async () => { if (!jaCerts.length) return; setGerando(true); try { const JSZip = (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default; const zip = new JSZip(); for (const c of jaCerts) { const doc = await gerarCertificadoPDF(mkP(c)); zip.file(`Certificado_${c.nome_aluno.replace(/\s+/g,"_")}.pdf`, doc.output("blob")); } const blob = await zip.generateAsync({type:"blob"}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Certificados_${turma.nome.replace(/\s+/g,"_")}.zip`; a.click(); } catch (err) { alert("Erro: " + err.message); } setGerando(false); };
              const enviarEmail = async (cert) => { const al = alunosT.find((a)=>a.id===cert.aluno_id); if(!al?.email){alert("Sem e-mail.");return;} try { const doc = await gerarCertificadoPDF(mkP(cert)); const res = await fetch("/api/enviar-certificado",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:al.email,nomeAluno:cert.nome_aluno,nomeCurso:cert.nome_curso,codigo:cert.codigo,pdfBase64:doc.output("datauristring").split(",")[1]})}); const r = await res.json(); if(r.ok) alert(`Enviado para ${al.email}!`); else alert("Erro: "+(r.error||"")); } catch(err){alert("Erro: "+err.message);} };
              const enviarTodos = async () => { const ce = jaCerts.filter((c)=>alunosT.find((a)=>a.id===c.aluno_id)?.email); if(!ce.length){alert("Nenhum com e-mail.");return;} if(!confirm(`Enviar para ${ce.length} aluno(s)?`)) return; setGerando(true); let ok=0; for(const c of ce){try{await enviarEmail(c);ok++;}catch{}} setGerando(false); alert(`${ok}/${ce.length} enviados!`); };

              return (
                <div>
                  <div style={{ marginBottom: 14, padding: "12px 16px", background: "rgba(200,169,110,0.06)", borderRadius: 10, border: "1px solid rgba(200,169,110,0.1)" }}>
                    <p style={{ color: "#C8A96E", fontSize: 12, fontWeight: 600, margin: 0 }}>{turma.nome} — {turma.curso} · {getCH(turma.carga_horaria)}h · {aulasT.length} aulas · {alunosT.length} alunos{dataIni && ` · ${fmtDateBR(dataIni)} a ${fmtDateBR(dataFin)}`} · Freq. mínima: {freqMin}%</p>
                  </div>
                  {aptos.length > 0 && (<div style={{ marginBottom: 16 }}><h3 style={{ color: "#2ecc71", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>✅ Aptos para certificado ({aptos.length})</h3>{aptos.map((al) => (<div key={al.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", flexWrap: "wrap" }}><span style={{ color: "#F1EFE8", fontSize: 12, fontWeight: 600, minWidth: 200 }}>{al.nome}</span><span style={{ color: "#2ecc71", fontSize: 11, fontWeight: 700 }}>{al.freq}%</span><input placeholder="Observação (ex: Com destaque)" value={certObs[al.id]||""} onChange={(e)=>setCertObs({...certObs,[al.id]:e.target.value})} style={{ ...inp, padding: "6px 10px", fontSize: 11, flex: 1, minWidth: 150 }} /></div>))}</div>)}
                  {reprov.length > 0 && (<div style={{ marginBottom: 16 }}><h3 style={{ color: "#e74c3c", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>❌ Abaixo da frequência mínima ({reprov.length})</h3>{reprov.map((al) => (<div key={al.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}><span style={{ color: "#888", fontSize: 12 }}>{al.nome}</span><span style={{ color: "#e74c3c", fontSize: 11, fontWeight: 700 }}>{al.freq}% ({al.pres}/{al.tot})</span></div>))}</div>)}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                    {aptos.length > 0 && <button style={{ ...btnP, opacity: gerando ? 0.6 : 1 }} onClick={gerarTodos} disabled={gerando}>{gerando ? "⏳ Gerando..." : `📜 GERAR (${aptos.length})`}</button>}
                    {jaCerts.length > 0 && (<><button style={{ ...btnP, background: "linear-gradient(135deg, #3498db, #2471a3)", opacity: gerando ? 0.6 : 1 }} onClick={baixarZIP} disabled={gerando}>{gerando ? "⏳ ..." : `📦 ZIP (${jaCerts.length})`}</button><button style={{ ...btnP, background: "linear-gradient(135deg, #27ae60, #1e8449)", opacity: gerando ? 0.6 : 1 }} onClick={enviarTodos} disabled={gerando}>{gerando ? "⏳ ..." : "📧 ENVIAR TODOS"}</button></>)}
                  </div>
                  {jaCerts.length > 0 && (<div><h3 style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Certificados ({jaCerts.length}/{alunosT.length})</h3><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{jaCerts.map((cert) => { const al = alunosT.find((a)=>a.id===cert.aluno_id); const te = !!al?.email; return (<div key={cert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.025)", borderRadius: 10, border: "1px solid rgba(200,169,110,0.08)", flexWrap: "wrap", gap: 10 }}><div><span style={{ color: "#F1EFE8", fontSize: 13, fontWeight: 600 }}>{cert.nome_aluno}</span><span style={{ color: "#C8A96E", fontSize: 11, fontWeight: 700, marginLeft: 10 }}>{cert.codigo}</span><span style={{ color: cert.frequencia >= 75 ? "#2ecc71" : "#e74c3c", fontSize: 11, fontWeight: 700, marginLeft: 10 }}>{cert.frequencia}%</span>{al?.email && <span style={{ color: "#555", fontSize: 10, marginLeft: 10 }}>📧 {al.email}</span>}</div><div style={{ display: "flex", gap: 6 }}><button onClick={()=>previewPDF(cert)} style={{ padding: "6px 12px", fontSize: 11, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, background: "rgba(52,152,219,0.12)", color: "#3498db", border: "1px solid rgba(52,152,219,0.25)", borderRadius: 8, cursor: "pointer" }}>👁 PREVIEW</button><button onClick={()=>baixarPDF(cert)} style={{ padding: "6px 12px", fontSize: 11, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, background: "rgba(200,169,110,0.12)", color: "#C8A96E", border: "1px solid rgba(200,169,110,0.25)", borderRadius: 8, cursor: "pointer" }}>📄 PDF</button><button onClick={()=>enviarEmail(cert)} disabled={!te} style={{ padding: "6px 12px", fontSize: 11, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, background: te ? "rgba(39,174,96,0.12)" : "rgba(255,255,255,0.03)", color: te ? "#2ecc71" : "#555", border: te ? "1px solid rgba(39,174,96,0.25)" : "1px solid rgba(255,255,255,0.05)", borderRadius: 8, cursor: te ? "pointer" : "default", opacity: te ? 1 : 0.5 }}>📧</button></div></div>); })}</div></div>)}
                </div>
              );
            })()}
          </div>
        )}


        {/* ========== RELATÓRIOS ========== */}
        {tab === "relatorios" && (
          <div>
            <h2 style={{ color: "#F1EFE8", fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Relatórios</h2>

            {/* Exportar Presença */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📊 Exportar Mapa de Presença</h3>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Turma</label>
                  <select style={{ ...inp, appearance: "auto", minWidth: 250 }} value={filtroTurma} onChange={(e) => setFiltroTurma(e.target.value)}>
                    <option value="">Selecione...</option>
                    {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome} — {t.curso}</option>)}
                  </select>
                </div>
                {filtroTurma && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={async () => {
                      const turma = turmas.find((t) => t.id === filtroTurma);
                      const aulasT = aulasDaTurma(filtroTurma);
                      const alunosT = alunosDaTurma(filtroTurma);
                      if (!alunosT.length) return;
                      const { jsPDF } = await import("jspdf");
                      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
                      doc.setFontSize(16); doc.setFont("helvetica","bold");
                      doc.text(`Mapa de Presença — ${turma.nome} (${turma.curso})`, 15, 15);
                      doc.setFontSize(10); doc.setFont("helvetica","normal");
                      doc.text(`Período: ${aulasT.length ? fmtDateFull(aulasT[0].data_aula) + " a " + fmtDateFull(aulasT[aulasT.length-1].data_aula) : "—"} · ${alunosT.length} alunos · ${aulasT.length} aulas`, 15, 22);
                      let y = 32;
                      doc.setFontSize(8); doc.setFont("helvetica","bold");
                      doc.text("Aluno", 15, y);
                      aulasT.forEach((a, i) => doc.text(`A${i+1}`, 75 + i * 18, y, { align: "center" }));
                      doc.text("Total", 75 + aulasT.length * 18 + 5, y);
                      y += 2; doc.setLineWidth(0.3); doc.line(15, y, 280, y); y += 5;
                      doc.setFont("helvetica","normal");
                      alunosT.forEach((al) => {
                        if (y > 190) { doc.addPage(); y = 15; }
                        doc.text(al.nome.substring(0, 35), 15, y);
                        let total = 0;
                        aulasT.forEach((a, i) => {
                          const ok = temCheckin(al.id, a.id);
                          if (ok) total++;
                          doc.text(ok ? "✓" : "·", 75 + i * 18, y, { align: "center" });
                        });
                        const pct = aulasT.length ? Math.round((total/aulasT.length)*100) : 0;
                        doc.text(`${total}/${aulasT.length} (${pct}%)`, 75 + aulasT.length * 18 + 5, y);
                        y += 6;
                      });
                      doc.save(`Presenca_${turma.nome.replace(/\s+/g,"_")}.pdf`);
                    }} style={{ ...btnP, padding: "10px 18px", fontSize: 12 }}>📄 Exportar PDF</button>
                    <button onClick={() => {
                      const turma = turmas.find((t) => t.id === filtroTurma);
                      const aulasT = aulasDaTurma(filtroTurma);
                      const alunosT = alunosDaTurma(filtroTurma);
                      if (!alunosT.length) return;
                      let csv = "Aluno;" + aulasT.map((a,i) => `Aula ${i+1} (${fmtDate(a.data_aula)})`).join(";") + ";Total;%\n";
                      alunosT.forEach((al) => {
                        let total = 0;
                        const cols = aulasT.map((a) => { const ok = temCheckin(al.id, a.id); if (ok) total++; return ok ? "P" : "F"; });
                        const pct = aulasT.length ? Math.round((total/aulasT.length)*100) : 0;
                        csv += `${al.nome};${cols.join(";")};${total}/${aulasT.length};${pct}%\n`;
                      });
                      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                      a.download = `Presenca_${turma.nome.replace(/\s+/g,"_")}.csv`; a.click();
                    }} style={{ ...btnP, padding: "10px 18px", fontSize: 12, background: "linear-gradient(135deg, #27ae60, #1e8449)" }}>📊 Exportar Excel/CSV</button>
                  </div>
                )}
              </div>
            </div>

            {/* Alunos por curso */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>👥 Alunos por Curso</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Curso", "Turmas", "Total Alunos", "Com Certificado", "Taxa Certificação"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: "#C8A96E", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(200,169,110,0.12)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const cursos = {};
                      turmas.forEach((t) => {
                        if (!cursos[t.curso]) cursos[t.curso] = { turmas: 0, alunos: 0, certs: 0 };
                        cursos[t.curso].turmas++;
                        cursos[t.curso].alunos += alunos.filter((a) => a.turma_id === t.id).length;
                        cursos[t.curso].certs += certificados.filter((c) => c.turma_id === t.id).length;
                      });
                      return Object.entries(cursos).map(([curso, data]) => (
                        <tr key={curso}>
                          <td style={{ padding: "11px 16px", color: "#F1EFE8", fontSize: 13, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{curso}</td>
                          <td style={{ padding: "11px 16px", color: "#888", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.turmas}</td>
                          <td style={{ padding: "11px 16px", color: "#C8A96E", fontSize: 13, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.alunos}</td>
                          <td style={{ padding: "11px 16px", color: "#2ecc71", fontSize: 13, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.certs}</td>
                          <td style={{ padding: "11px 16px", color: "#888", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.alunos ? Math.round((data.certs/data.alunos)*100) : 0}%</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(200,169,110,0.06)", borderRadius: 10, border: "1px solid rgba(200,169,110,0.1)" }}>
                <p style={{ color: "#C8A96E", fontSize: 12, fontWeight: 600, margin: 0 }}>
                  Total geral: {alunos.length} alunos · {turmas.length} turmas · {certificados.length} certificados emitidos
                </p>
              </div>
            </div>

            {/* Resumo por período */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ color: "#C8A96E", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📈 Resumo por Período</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Mês/Ano", "Turmas Iniciadas", "Alunos Matriculados", "Certificados Emitidos"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: "#C8A96E", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(200,169,110,0.12)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const meses = {};
                      const NOMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
                      turmas.forEach((t) => {
                        const d = new Date(t.criado_em);
                        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
                        const label = `${NOMES[d.getMonth()]}/${d.getFullYear()}`;
                        if (!meses[key]) meses[key] = { label, turmas: 0, alunos: 0, certs: 0 };
                        meses[key].turmas++;
                        meses[key].alunos += alunos.filter((a) => a.turma_id === t.id).length;
                        meses[key].certs += certificados.filter((c) => c.turma_id === t.id).length;
                      });
                      return Object.entries(meses).sort((a,b) => b[0].localeCompare(a[0])).map(([key, data]) => (
                        <tr key={key}>
                          <td style={{ padding: "11px 16px", color: "#F1EFE8", fontSize: 13, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.label}</td>
                          <td style={{ padding: "11px 16px", color: "#888", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.turmas}</td>
                          <td style={{ padding: "11px 16px", color: "#C8A96E", fontSize: 13, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.alunos}</td>
                          <td style={{ padding: "11px 16px", color: "#2ecc71", fontSize: 13, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{data.certs}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
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

            {/* Google Calendar */}
            <div style={{ marginTop: 28, padding: 18, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(66,133,244,0.15)" }}>
              <h3 style={{ color: "#4285f4", fontSize: 13, fontWeight: 700, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>📅 Google Calendar</h3>
              <p style={{ color: "#888", fontSize: 12, lineHeight: 1.7, margin: "0 0 14px" }}>
                Conecte seu Google Calendar para que as aulas sejam adicionadas automaticamente ao criar uma turma.
              </p>
              <a href="/api/google-auth" style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px",
                fontSize: 13, fontFamily: "'Montserrat', sans-serif", fontWeight: 700,
                background: "rgba(66,133,244,0.15)", color: "#4285f4",
                border: "1px solid rgba(66,133,244,0.3)", borderRadius: 8,
                textDecoration: "none", cursor: "pointer",
              }}>📅 Conectar Google Calendar</a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
