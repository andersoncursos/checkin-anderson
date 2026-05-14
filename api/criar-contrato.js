export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_TOKEN;
  if (!AUTENTIQUE_TOKEN) {
    return new Response(JSON.stringify({ error: "AUTENTIQUE_TOKEN não configurada" }), { status: 500 });
  }

  try {
    const { aluno, turma, pagamento } = await req.json();

    // Build contract HTML
    const hoje = new Date();
    const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    const dataContrato = `João Pessoa, ${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}.`;

    // Payment clause
    let clausulaPagamento = "";
    if (pagamento.forma === "pix") {
      clausulaPagamento = `2.1. O valor total do curso é de R$ ${pagamento.valor}, tendo o pagamento sido efetuado à vista via PIX.`;
    } else {
      clausulaPagamento = `2.1. O valor total do curso é de R$ ${pagamento.valor_total}, tendo o pagamento sido efetuado através de cartão de crédito em ${pagamento.parcelas}x de R$ ${pagamento.valor_parcela}.`;
    }

    const contratoHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; color: #222; max-width: 700px; margin: 40px auto; padding: 20px; }
  h1 { text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 30px; }
  .clausula { font-weight: bold; margin-top: 20px; }
  .assinatura { margin-top: 50px; }
  .assinatura-bloco { display: inline-block; width: 45%; text-align: center; vertical-align: top; }
  .linha { border-top: 1px solid #222; margin-top: 60px; padding-top: 5px; }
  strong { font-weight: bold; }
</style>
</head>
<body>

<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS</h1>

<p>Pelo presente instrumento particular, de um lado, <strong>ANDERSON CURSOS E TREINAMENTOS LTDA</strong>, inscrita no CNPJ sob o nº 24.335.154/0001-00, com sede na Av. Presidente Epitácio Pessoa, 753 - Sala 305 - Empresarial Central Park - Bairro dos Estados - João Pessoa/PB, doravante denominada CONTRATADA, e de outro lado, <strong>${aluno.nome}</strong>, inscrito(a) no CPF/CNPJ sob o nº <strong>${aluno.cpf}</strong>, residente e domiciliado(a) em ${aluno.endereco}${aluno.bairro ? ", " + aluno.bairro : ""}${aluno.cidade ? " - " + aluno.cidade + "/" + aluno.estado : ""}, doravante denominado(a) CONTRATANTE, firmam o presente Contrato de Prestação de Serviços Educacionais, conforme as cláusulas e condições abaixo descritas:</p>

<p class="clausula">CLÁUSULA 1 - DO OBJETO</p>

<p>1.1. O presente contrato tem como objeto a prestação de serviços educacionais pela CONTRATADA ao CONTRATANTE, consistentes na oferta do curso presencial de <strong>${turma.curso}</strong>, conforme conteúdo programático previamente disponibilizado, com carga horária de <strong>${turma.carga_horaria}h</strong>.</p>

<p>1.2. O curso será realizado nas dependências da CONTRATADA, localizada na Av. Presidente Epitácio Pessoa, 753 - Sala 305 - Empresarial Central Park - Bairro dos Estados - João Pessoa/PB, no período de ${turma.periodo}, das ${turma.horario}.</p>

<p class="clausula">CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO</p>

<p>${clausulaPagamento}</p>

<p>2.2. O pagamento foi efetuado por meio de ${pagamento.forma === "pix" ? "PIX" : "cartão de crédito"}.</p>

<p class="clausula">CLÁUSULA 3 - DA PROIBIÇÃO DE TROCA DE HORÁRIO OU TURMA</p>

<p>3.1. O CONTRATANTE está ciente de que não será permitido trocar o horário ou a turma inicialmente designada no momento da matrícula.</p>

<p>3.2. A vaga do CONTRATANTE é pessoal e intransferível, não podendo ser repassada para terceiros sob nenhuma hipótese.</p>

<p class="clausula">CLÁUSULA 4 - DA DESISTÊNCIA E MULTA</p>

<p>4.1. Em caso de desistência, o CONTRATANTE deverá comunicar a CONTRATADA por escrito com antecedência mínima de 7 dias antes do início do curso.</p>

<p>4.2. Caso a desistência ocorra com prazo inferior a 7 dias antes do início do curso, será aplicada uma multa de 20% do valor total do curso, a título de compensação pela quebra de contrato.</p>

<p>4.3. Caso a desistência ocorra após o início do curso, será aplicada uma multa de 10% do valor total do curso, a título de compensação pela quebra de contrato.</p>

<p class="clausula">CLÁUSULA 5 - DA RESPONSABILIDADE E OBRIGAÇÕES</p>

<p>5.1. A CONTRATADA se compromete a ministrar o curso de acordo com o conteúdo programático anunciado e dentro do período previamente informado.</p>

<p>5.2. O CONTRATANTE se compromete a frequentar as aulas no horário estipulado, respeitar as normas internas da CONTRATADA e zelar pelo bom andamento das atividades. Lembrando que não há reposição de aulas por faltas nas aulas.</p>

<p class="clausula">CLÁUSULA 6 – PROIBIÇÃO DE GRAVAÇÃO E DIVULGAÇÃO DE CONTEÚDO</p>

<p>Em conformidade com o disposto nos artigos 186 e 927 do Código Civil Brasileiro, que regulam a responsabilidade civil por atos ilícitos, fica expressamente vedado aos alunos, sob qualquer pretexto, realizar gravações, fotografias ou filmagens das aulas ministradas, bem como divulgar ou compartilhar, por qualquer meio, o conteúdo exposto em sala de aula, sem prévia autorização escrita da instituição de ensino e do respectivo professor.</p>

<p>A infração a esta cláusula sujeitará o aluno às penalidades previstas em contrato, podendo ensejar a sua responsabilização civil pelos danos morais e materiais causados à instituição de ensino, ao corpo docente e a terceiros envolvidos, sem prejuízo das sanções acadêmicas cabíveis.</p>

<p class="clausula">CLÁUSULA 7 - DAS CONDIÇÕES GERAIS</p>

<p>7.1. O presente contrato tem validade a partir da assinatura pelas partes e se encerra após a conclusão do curso, conforme descrito na Cláusula 1.</p>

<p>7.2. As partes elegem o foro da Comarca de João Pessoa para dirimir quaisquer questões oriundas deste contrato, com renúncia expressa de qualquer outro, por mais privilegiado que seja.</p>

<p>Por estarem de acordo com as cláusulas acima, as partes assinam o presente contrato em duas vias de igual teor e forma, na presença de testemunhas.</p>

<p>${dataContrato}</p>

<div class="assinatura">
  <div class="assinatura-bloco">
    <div class="linha">
      <strong>ANDERSON CURSOS E TREINAMENTOS LTDA</strong><br>
      24.335.154/0001-00
    </div>
  </div>
  <div class="assinatura-bloco" style="margin-left: 8%;">
    <div class="linha">
      <strong>${aluno.nome}</strong><br>
      ${aluno.cpf}
    </div>
  </div>
</div>

</body>
</html>`;

    // Convert HTML to Blob for upload
    const htmlBlob = new Blob([contratoHTML], { type: "text/html" });
    const fileName = `Contrato_${aluno.nome.replace(/\s+/g, "_")}_${Date.now()}.html`;

    // Build multipart form data for Autentique GraphQL API
    const formData = new FormData();

    const operations = JSON.stringify({
      query: `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
        createDocument(document: $document, signers: $signers, file: $file) {
          id
          name
          created_at
          signatures {
            public_id
            name
            email
            action { name }
            link { short_link }
          }
        }
      }`,
      variables: {
        document: {
          name: `Contrato - ${aluno.nome} - ${turma.curso}`
        },
        signers: [
          {
            email: aluno.email,
            action: "SIGN",
            name: aluno.nome
          }
        ],
        file: null
      }
    });

    formData.append("operations", operations);
    formData.append("map", '{"file": ["variables.file"]}');
    formData.append("file", htmlBlob, fileName);

    const autentiqueRes = await fetch("https://api.autentique.com.br/v2/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTENTIQUE_TOKEN}`,
      },
      body: formData,
    });

    const autentiqueData = await autentiqueRes.json();

    if (autentiqueData.errors) {
      return new Response(JSON.stringify({
        ok: false,
        error: autentiqueData.errors[0]?.message || "Erro Autentique"
      }), { status: 400 });
    }

    const doc = autentiqueData.data?.createDocument;
    const linkAssinatura = doc?.signatures?.[0]?.link?.short_link || null;

    return new Response(JSON.stringify({
      ok: true,
      autentique_id: doc?.id,
      link_assinatura: linkAssinatura,
      nome_documento: doc?.name,
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
