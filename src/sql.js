export const SQL_SETUP = `-- Execute no SQL Editor do Supabase:

-- 1. Turmas
CREATE TABLE turmas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  curso TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aulas (datas específicas de cada turma)
CREATE TABLE aulas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id UUID REFERENCES turmas(id) ON DELETE CASCADE,
  data_aula DATE NOT NULL,
  descricao TEXT DEFAULT '',
  UNIQUE(turma_id, data_aula)
);

-- 3. Alunos
CREATE TABLE alunos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  celular TEXT NOT NULL,
  turma_id UUID REFERENCES turmas(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(celular, turma_id)
);

-- 4. Check-ins (vinculado à aula específica)
CREATE TABLE checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aluno_id UUID REFERENCES alunos(id),
  aula_id UUID REFERENCES aulas(id),
  turma_id UUID REFERENCES turmas(id),
  hora_checkin TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(aluno_id, aula_id)
);

-- 5. RLS aberto (para funcionar com anon key)
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_turmas" ON turmas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pub_aulas" ON aulas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pub_alunos" ON alunos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pub_checkins" ON checkins FOR ALL USING (true) WITH CHECK (true);
`;
