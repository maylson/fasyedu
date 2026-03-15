# FASY

FASY (Formative Assessment System) é um sistema de gestão escolar e pedagógica multiescola, com foco em planejamento de aulas, coordenação pedagógica, comunicação institucional e acompanhamento acadêmico.

## Estado atual

Projeto em desenvolvimento ativo, já com base funcional suficiente para operação real em ambiente escolar.

## Módulos implementados

- Autenticação: login, esqueci senha e redefinição de senha com Supabase Auth.
- Controle de acesso por perfil: Direção, Coordenação, Professor, Secretaria, Pai, Aluno e SUPPORT.
- Multi-escola com contexto de escola ativa.
- Usuários e perfis: criação, edição, busca paginada e gestão de múltiplos papéis por escola.
- Turmas: cadastro, edição, exclusão e série por etapa.
- Disciplinas por turma: cadastro, edição, exclusão e duplicação entre turmas.
- Horários: grade semanal por turma, aula/intervalo, edição e exclusão.
- Planejamento: grade semanal, status, Wizard IA, recursos extras, duplicação e exportação em PDF.
- Coordenação pedagógica: visão global e gestão de status de planejamento.
- Agenda da família: aulas, conteúdos, tarefas e eventos da semana para pais e alunos.
- Calendário escolar e mural com anexos.
- Alunos e pais: cadastro de alunos, ficha, foto, responsáveis vinculados e histórico de matrículas.
- Dashboard por perfil e Minha Conta.

## Pontos de atenção

- Ainda há textos com problema de encoding em partes legadas da interface.
- Existem fluxos em nível MVP que ainda pedem refinamento de UX.
- Ainda não existe suíte formal de testes automatizados.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Supabase (Postgres, Auth, Storage, RLS)

## Estrutura principal

- `src/app`: rotas e páginas.
- `src/components`: componentes visuais e grids.
- `src/lib/actions`: server actions.
- `src/lib/supabase`: clients Supabase.
- `supabase/migrations`: evolução do schema.
- `scripts`: importações e utilitários de dados.

## Variáveis de ambiente

Use `.env` com base em `.env.example`.

Obrigatórias:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Execução local

```bash
npm install
npm run dev
```

Aplicação em `http://localhost:3000`.

## Banco de dados (Supabase)

Migrar schema:

```bash
npx supabase db push
```

## Qualidade

```bash
npm run lint
npm run typecheck
npm run build
```

Ou tudo em sequência:

```bash
npm run check
```

## Wizard de IA

Configuração por escola em `Configurações > Pedagógico`:

- habilitar/desabilitar Wizard;
- provedor/modelo;
- base URL opcional;
- API key;
- prompt template por escola.

## Migração de planejamentos legados

Scripts já disponíveis para importação e reconciliação de planejamentos legados:

- `scripts/migrate_legacy_lesson_plans.mjs`
- `scripts/import_legacy2_lesson_plans_strict.mjs`
- `scripts/import_legacy3_with_overrides.mjs`

Artefatos gerados ficam em `generated_schedules/`.
