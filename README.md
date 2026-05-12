# Check-in de Presença — Anderson Cursos

Sistema de controle de presença para cursos presenciais.
Alunos fazem check-in pelo celular, professor acompanha a frequência em tempo real.

## Deploy no Vercel

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor** e execute o conteúdo do arquivo `src/sql.js`
3. Copie a **URL** e a **anon key** (em Settings → API)

### 2. Vercel
1. Suba este projeto no GitHub
2. Conecte o repo no [vercel.com](https://vercel.com)
3. Em **Settings → Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` → sua URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` → sua anon key
4. Deploy!

### Rotas
- `/` → Painel do professor (criar turmas, alunos, ver presença)
- `/c/:turmaId` → Link de check-in do aluno (enviar no WhatsApp)

## Fluxo
1. Professor cria turma com datas de aula
2. Professor cadastra alunos (nome + celular)
3. No dia da aula, copia o link da turma e envia no WhatsApp
4. Aluno abre o link, digita celular, confirma presença
5. Professor acompanha o mapa de presença dia a dia
