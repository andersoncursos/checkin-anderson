import { LOGO_B64, SIG_B64 } from "./assets";

// Month names in Portuguese
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function dataExtenso(dateStr) {
  // dateStr = "2026-05-10" -> "João Pessoa, 10 de maio de 2026"
  const [y, m, d] = dateStr.split("-");
  return `João Pessoa, ${parseInt(d)} de ${MESES[parseInt(m) - 1]} de ${y}`;
}

export function fmtDateBR(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export function gerarCodigo() {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `AC-${year}-${rand}`;
}

export async function gerarCertificadoPDF({
  nomeAluno,
  nomeCurso,
  cargaHoraria,
  dataInicio,
  dataFim,
  frequencia,
  codigo,
  observacao,
}) {
  // Import jsPDF from npm
  const { jsPDF } = await import("jspdf");

  // A4 landscape: 297 x 210 mm
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;

  // ===== BACKGROUND =====
  doc.setFillColor(26, 26, 24); // #1A1A18
  doc.rect(0, 0, W, H, "F");

  // ===== LOGO =====
  const logoW = 58;
  const logoH = 17.6;
  doc.addImage(LOGO_B64, "PNG", W / 2 - logoW / 2, 22, logoW, logoH);

  // ===== Gold line under logo =====
  doc.setDrawColor(200, 169, 110); // #C8A96E
  doc.setLineWidth(0.6);
  const lineW = 25;
  doc.line(W / 2 - lineW / 2, 44, W / 2 + lineW / 2, 44);

  // ===== DOCUMENTO OFICIAL =====
  doc.setTextColor(200, 169, 110);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("D O C U M E N T O   O F I C I A L", W / 2, 52, { align: "center" });

  // ===== CERTIFICADO =====
  doc.setFontSize(40);
  doc.setFont("helvetica", "bold");
  doc.text("Certificado", W / 2, 67, { align: "center" });

  // ===== DE CONCLUSÃO DE CURSO =====
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("D E   C O N C L U S Ã O   D E   C U R S O", W / 2, 74, { align: "center" });

  // ===== Gold line =====
  doc.line(W / 2 - lineW / 2, 77, W / 2 + lineW / 2, 77);

  // ===== Certificamos que =====
  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.text("Certificamos que", W / 2, 84, { align: "center" });

  // ===== NOME DO ALUNO =====
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(241, 239, 232); // #F1EFE8
  doc.text(nomeAluno, W / 2, 96, { align: "center" });

  // ===== Gold line under name =====
  doc.setDrawColor(200, 169, 110);
  doc.setLineWidth(0.3);
  doc.line(W / 2 - 80, 99, W / 2 + 80, 99);

  // ===== MAIN TEXT =====
  const texto =
    `nos termos do inciso I, do § 2º, artigo 39 da Lei 9.394 de 1996, o presente certificado ` +
    `por sua participação no curso de ${nomeCurso}, promovido pela Anderson Cursos e ` +
    `Treinamentos LTDA, inscrita no CNPJ 24.335.154/0001-00, ministrado por José Anderson ` +
    `Ferreira Andrade Silva, na cidade de João Pessoa, entre os dias ${fmtDateBR(dataInicio)} e ${fmtDateBR(dataFim)}, ` +
    `totalizando ${cargaHoraria} horas/aula, com frequência de ${frequencia}%.`;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(241, 239, 232);
  const textLines = doc.splitTextToSize(texto, 170);
  doc.text(textLines, W / 2, 106, { align: "center" });

  // ===== DATA POR EXTENSO =====
  const yAfterText = 106 + textLines.length * 4.5 + 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 169, 110);
  doc.text(dataExtenso(dataFim), W / 2, yAfterText, { align: "center" });

  // ===== OBSERVAÇÃO (opcional) =====
  if (observacao) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(241, 239, 232);
    doc.text(observacao, W / 2, yAfterText + 7, { align: "center" });
  }

  // ===== SIGNATURE =====
  const sigW = 42;
  const sigH = 11.8;
  const sigX = 35;
  const sigLineY = 178;
  doc.addImage(SIG_B64, "PNG", sigX, sigLineY - sigH + 2, sigW, sigH);

  // Gold line under signature
  doc.setDrawColor(200, 169, 110);
  doc.setLineWidth(0.25);
  doc.line(sigX, sigLineY, sigX + 65, sigLineY);

  // Name
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(241, 239, 232);
  doc.text("José Anderson Ferreira Andrade Silva", sigX, sigLineY + 5);

  doc.setFontSize(6.5);
  doc.setTextColor(200, 169, 110);
  doc.text("D I R E T O R   E   I N S T R U T O R", sigX, sigLineY + 9);

  doc.setFontSize(6);
  doc.setTextColor(102, 102, 102);
  doc.text("Anderson Cursos e Treinamentos LTDA · CNPJ 24.335.154/0001-00", sigX, sigLineY + 13);

  // ===== VERIFICATION BOX =====
  const boxW = 92;
  const boxH = 24;
  const boxX = W / 2 - boxW / 2 + 5;
  const boxY = H - 30;

  doc.setFillColor(34, 34, 32); // #222220
  doc.setDrawColor(51, 51, 48);
  doc.setLineWidth(0.15);
  doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, "FD");

  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 169, 110);
  doc.text("V E R I F I C A Ç Ã O   D E   A U T E N T I C I D A D E", boxX + boxW / 2, boxY + 6.5, { align: "center" });

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(241, 239, 232);
  doc.text(codigo, boxX + boxW / 2, boxY + 14.5, { align: "center" });

  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(136, 136, 136);
  doc.text(`andersoncursos.com/validar-certificado/${codigo}`, boxX + boxW / 2, boxY + boxH - 3, { align: "center" });

  // ===== QR CODE =====
  // Generate QR as canvas then add to PDF
  const qrUrl = `https://andersoncursos.com/validar-certificado/${codigo}`;
  const qrDataUrl = await generateQR(qrUrl);
  if (qrDataUrl) {
    const qrSize = 24;
    const qrX = W - 33 - qrSize;
    const qrY = H - 30;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    doc.setFontSize(5.5);
    doc.setTextColor(136, 136, 136);
    doc.text("V A L I D A R   C E R T I F I C A D O", qrX + qrSize / 2, qrY + qrSize + 4, { align: "center" });
  }

  return doc;
}

async function generateQR(text) {
  // Use a canvas-based QR generator
  try {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    document.head.appendChild(script);
    await new Promise((r) => (script.onload = r));

    const container = document.createElement("div");
    container.style.display = "none";
    document.body.appendChild(container);

    new window.QRCode(container, {
      text,
      width: 256,
      height: 256,
      colorDark: "#C8A96E",
      colorLight: "#1A1A18",
      correctLevel: window.QRCode.CorrectLevel.M,
    });

    // Wait for QR to render
    await new Promise((r) => setTimeout(r, 200));
    const canvas = container.querySelector("canvas");
    const dataUrl = canvas ? canvas.toDataURL("image/png") : null;
    document.body.removeChild(container);
    return dataUrl;
  } catch (e) {
    console.error("QR generation failed:", e);
    return null;
  }
}
