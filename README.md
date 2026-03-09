# FASY

FASY (Formative Assessment System) e um sistema de gestao escolar e pedagogica multiescola, com foco em planejamento de aulas e avaliacao formativa.

## Estado atual do projeto

Projeto em desenvolvimento ativo, com base funcional para uso interno ja implementada.

### Modulos com implementacao forte

- Autenticacao: login, esqueci senha, redefinicao de senha (Supabase Auth).
- Controle de acesso por perfil: Direcao, Coordenacao, Professor, Secretaria, Pai, Aluno.
- Multi-escola com contexto por escola ativa.
- Usuarios e perfis: criacao, vinculacao de papeis, edicao (Direcao).
- Turmas: cadastro, edicao, exclusao, serie por etapa.
- Disciplinas por turma: cadastro, edicao, exclusao, duplicacao entre turmas.
- Horarios: grade semanal por turma, aula/intervalo, edicao e exclusao, permissao de edicao por perfil.
- Planejamento do professor: grade semanal, status (Sem planejamento, Rascunho, Revisao Humana, Aprovado, Rejeitado), modal de edicao.
- Wizard de IA no planejamento: configuravel por escola (provedor, modelo, base URL, prompt), historico por aula, fallback local.
- Coordenacao pedagogica: visao semanal por turma e gestao de planejamentos.
- Calendario escolar: eventos com tipo, segmentacao (etapa/serie/turma), evento administrativo, anexo.
- Mural: timeline de avisos + eventos, publicacao por Direcao/Coordenacao, pre-visualizacao de imagem/PDF.
- Dashboard por perfil: Direcao, Coordenacao e Professor.
- Minha Conta: dados pessoais, resumo de acesso, troca de senha.

### Modulos basicos/parciais

- Alunos e Pais: cadastro/listagem base.
- Matriculas: listagem base.
- Avaliacoes: listagem base.

### Pontos de atencao atuais

- Ainda existem textos com problema de encoding em alguns arquivos antigos (ex.: `ç`, `ã`).
- Ha funcionalidades com foco em MVP e que ainda pedem refinamento de UX e fluxo.
- Nao ha suite formal de testes automatizados (unitarios/integracao/e2e).

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Supabase (Postgres, Auth, Storage, RLS)
- ESLint

## Estrutura principal

- `src/app`: rotas e paginas (dashboard, planejamento, horarios, mural, etc.)
- `src/components`: componentes de UI e grids semanais
- `src/lib/actions`: server actions (academico, usuarios, conta, configuracoes)
- `src/lib/supabase`: clientes supabase (server/admin/client)
- `supabase/migrations`: schema e evolucao do banco
- `scripts`: utilitarios de importacao/normalizacao de horarios

## Variaveis de ambiente

Use `.env` com base em `.env.example`.

Obrigatorias:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (necessaria para rotinas administrativas server-side)

## Execucao local

1. Instale dependencias:

```bash
npm install
```

2. Configure o `.env`.

3. Rode a aplicacao:

```bash
npm run dev
```

4. Abra:

`http://localhost:3000`

## Banco de dados (Supabase)

As migracoes estao em `supabase/migrations`.

Aplicar no projeto remoto:

```bash
npx supabase db push
```

## Qualidade

Lint:

```bash
npm run lint
```

Type-check:

```bash
npx tsc --noEmit
```

## IA no planejamento (Wizard)

Configuracao por escola em `Configuracoes > Pedagogico`:

- habilitar/desabilitar wizard
- provedor (`OPENAI`, `OPENAI_COMPAT`, `ANTHROPIC`)
- modelo
- base URL opcional
- API key
- prompt template por escola

Endpoint:

- `src/app/api/planning/wizard/route.ts`

## Documentacao de planejamento

Veja o roadmap do produto em:

- `ROADMAP.md`
