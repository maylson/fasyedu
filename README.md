# FASY

FASY (Formative Assessment System) é um sistema de gestão escolar e pedagógica multiescola, com foco em planejamento de aulas e avaliação formativa.

## Estado atual

Projeto em desenvolvimento ativo, com base funcional para operação real já disponível.

### Módulos implementados

- Autenticação: login, esqueci senha e redefinição de senha (Supabase Auth).
- Controle de acesso por perfil: Direção, Coordenação, Professor, Secretaria, Pai, Aluno e SUPPORT.
- Multi-escola com contexto de escola ativa.
- Usuários e perfis: criação, vinculação de papéis, edição e busca paginada.
- Turmas: cadastro, edição, exclusão, série por etapa.
- Disciplinas por turma: cadastro, edição, exclusão e duplicação entre turmas.
- Horários: grade semanal por turma, aula/intervalo, edição e exclusão.
- Planejamento: grade semanal, status, Wizard IA, recursos e duplicação.
- Coordenação pedagógica: visão global e gestão de status de planejamento.
- Calendário escolar e mural com anexos.
- Dashboard por perfil e Minha Conta.

### Pontos de atenção

- Ainda há textos com problema de encoding em partes legadas.
- Existem fluxos em nível MVP que ainda pedem refinamento de UX.
- Ainda não existe suíte formal de testes automatizados (unitário/integração/E2E).

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

## Migração de planejamentos legados (MySQL -> Supabase)

Foi adicionado o script:

- `scripts/migrate_legacy_lesson_plans.mjs`

Ele:

- lê o JSON legado (`lectures-old-system.json`);
- corrige mojibake (ex.: `InglÃªs` -> `Inglês`);
- ignora registros deletados (`Deletado = Sim`);
- mapeia cada aula para `class_schedules` por turma + dia da semana + horário;
- desambigua por professor/disciplina quando há mais de um horário no mesmo slot;
- converte status para o padrão atual (`DRAFT`, `HUMAN_REVIEW`, `APPROVED`, `REJECTED`);
- insere em `lesson_plans` sem sobrescrever existentes (conflitos são ignorados por `(class_schedule_id, lesson_date)`).

### 1) Simulação (sem gravar no banco)

```bash
npm run migrate:legacy:plans -- --input "c:/Users/Maylson/Desktop/lectures-old-system.json"
```

### 2) Aplicação no banco

```bash
npm run migrate:legacy:plans -- --input "c:/Users/Maylson/Desktop/lectures-old-system.json" --apply
```

### 3) Artefatos gerados

- `generated_schedules/migrate_legacy_lesson_plans_report.json`
- `generated_schedules/migrate_legacy_lesson_plans_unresolved.json`
- `generated_schedules/migrate_legacy_lesson_plans_preview.json`

Os casos em `unresolved` precisam de ajuste manual (tipicamente divergência de turma/horário/professor na base atual).

## Qualidade

```bash
npm run lint
npx tsc --noEmit
```

## Wizard de IA

Configuração por escola em `Configurações > Pedagógico`:

- habilitar/desabilitar Wizard;
- provedor/modelo;
- base URL opcional;
- API key;
- prompt template por escola.
