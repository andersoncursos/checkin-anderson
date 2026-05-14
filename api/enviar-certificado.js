export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), { status: 500 });
  }

  try {
    const { to, nomeAluno, nomeCurso, codigo, pdfBase64, assunto, htmlCustom, manualFilename } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Destinatário não informado" }), { status: 400 });
    }

    // Custom HTML email (lembretes, parabéns, boas-vindas)
    if (htmlCustom) {
      const emailPayload = {
        from: "Anderson Cursos <contato@andersoncursos.com>",
        to: [to],
        subject: assunto || `Anderson Cursos — ${nomeCurso}`,
        html: htmlCustom,
      };

      // Attach manual PDF if provided
      if (pdfBase64 && manualFilename) {
        emailPayload.attachments = [{
          filename: manualFilename,
          content: pdfBase64,
        }];
      }

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailPayload),
      });
      const resendData = await resendRes.json();
      if (resendRes.ok) {
        return new Response(JSON.stringify({ ok: true, id: resendData.id }), { status: 200 });
      } else {
        return new Response(JSON.stringify({ ok: false, error: resendData.message || "Erro Resend" }), { status: 400 });
      }
    }

    // Certificate email (with PDF attachment)
    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: "PDF não fornecido" }), { status: 400 });
    }

    const emailHtml = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1A1A18; padding: 40px 30px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #C8A96E; font-size: 24px; margin: 0;">Anderson Cursos</h1>
          <p style="color: #888; font-size: 12px; margin-top: 4px;">Cursos & Treinamentos</p>
        </div>
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(200,169,110,0.15); border-radius: 8px; padding: 24px; margin-bottom: 20px;">
          <p style="color: #F1EFE8; font-size: 16px; margin: 0 0 12px;">Olá, <strong>${nomeAluno}</strong>!</p>
          <p style="color: #bbb; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
            Parabéns pela conclusão do curso <strong style="color: #C8A96E;">${nomeCurso}</strong>!
            Segue em anexo o seu certificado de conclusão.
          </p>
          <div style="background: rgba(200,169,110,0.08); border: 1px solid rgba(200,169,110,0.2); border-radius: 6px; padding: 12px 16px; margin-bottom: 16px;">
            <p style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px;">Código de verificação</p>
            <p style="color: #C8A96E; font-size: 18px; font-weight: 700; margin: 0; letter-spacing: 1px;">${codigo}</p>
          </div>
          <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">
            Você pode validar seu certificado a qualquer momento em:<br>
            <a href="https://andersoncursos.com/validar-certificado/${codigo}" style="color: #C8A96E;">andersoncursos.com/validar-certificado/${codigo}</a>
          </p>
        </div>
        <div style="text-align: center; padding-top: 16px; border-top: 1px solid rgba(200,169,110,0.1);">
          <p style="color: #666; font-size: 11px; margin: 0;">
            Anderson Cursos e Treinamentos LTDA · CNPJ 24.335.154/0001-00<br>
            João Pessoa — PB
          </p>
        </div>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Anderson Cursos <certificados@andersoncursos.com>",
        to: [to],
        subject: `Certificado de Conclusão — ${nomeCurso}`,
        html: emailHtml,
        attachments: [
          {
            filename: `Certificado_${nomeAluno.replace(/\s+/g, "_")}.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    const resendData = await resendRes.json();

    if (resendRes.ok) {
      return new Response(JSON.stringify({ ok: true, id: resendData.id }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ ok: false, error: resendData.message || "Erro Resend" }), { status: 400 });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
