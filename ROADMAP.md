# ROADMAP FASY

## Objetivo

Consolidar o FASY como plataforma de gestao pedagogica multiescola para operacao real de escolas brasileiras, com foco em planejamento, acompanhamento e comunicacao.

## Horizonte e prioridade

- Curto prazo: estabilizacao e fechamento de MVP operacional.
- Medio prazo: escala multi-escola, analytics e fluxo academico completo.
- Longo prazo: inteligencia pedagogica e governanca institucional.

---

## Fase 1 - Estabilizacao do MVP (prioridade maxima)

### 1.1 Qualidade e confiabilidade

- Corrigir encoding em toda a interface (pt-BR consistente).
- Revisar mensagens de erro para linguagem de usuario final.
- Cobertura minima de testes:
  - acoes criticas (`academic.ts`, `users.ts`, `settings.ts`)
  - fluxos de autenticao
  - fluxo de planejamento + wizard
- Hardening de validacoes server-side para todas as forms.

### 1.2 Fluxos essenciais pendentes

- Matriculas:
  - cadastro/edicao/cancelamento (hoje esta majoritariamente listagem)
  - regras por ano letivo/turma/vagas
- Avaliacoes:
  - criacao de avaliacao, itens, notas
  - composicao de media e relatorios basicos
- Alunos e Pais:
  - melhorar gestao de responsaveis e vinculos aluno-responsavel
  - filtros e edicao completa

### 1.3 Mural e calendario

- Edicao/exclusao de avisos no mural.
- Confirmacoes visuais padronizadas em todas as acoes.
- Melhorias de desempenho na timeline em volumes altos (paginacao/cursor).

### Criterio de conclusao da fase

- Escola consegue operar ciclo semanal: horarios -> planejamento -> coordenacao -> comunicacao no mural, sem falhas criticas.

---

## Fase 2 - Operacao academica completa

### 2.1 Planejamento e coordenacao

- Historico completo de versoes do plano de aula.
- Trilhas de auditoria (quem alterou status, quando, motivo).
- Fila de revisao com filtros por professor/turma/serie/status.
- Painel de indicadores pedagogicos por turma/professor.

### 2.2 Notas e avaliacao formativa

- Rubricas e criterios por disciplina/turma.
- Boletim por periodo.
- Exportacao (PDF/CSV) para coordenacao e direcao.

### 2.3 Experiencia de usuario

- Melhorias responsivas mobile-first em telas operacionais densas.
- Componentes padronizados de loading, feedback e confirmacao.
- Acessibilidade (navegacao por teclado, contraste, foco).

### Criterio de conclusao da fase

- Operacao academica completa do periodo letivo dentro do sistema.

---

## Fase 3 - Escala multiescola e governanca

### 3.1 Backoffice FASY

- Gestao centralizada de escolas (onboarding, habilitacao de modulos, limites).
- Parametros por escola:
  - recursos pedagogicos
  - politicas de IA
  - templates institucionais

### 3.2 Observabilidade e seguranca

- Logs estruturados por modulo/acao.
- Alertas de erro e disponibilidade.
- Auditoria de acesso e eventos sensiveis.
- Revisao de RLS e politicas para cenarios edge.

### 3.3 Performance

- Paginacao em listas grandes.
- Caching de consultas de dashboard.
- Otimizacao de queries com indices orientados a uso real.

### Criterio de conclusao da fase

- Operacao segura de multiplas escolas simultaneas com governanca central.

---

## Fase 4 - Inteligencia pedagogica

### 4.1 IA aplicada com governanca

- Biblioteca de prompts versionada por escola.
- Politicas de moderacao e trilha de decisoes de IA.
- Score pedagogico explicavel por criterio.

### 4.2 Insights e recomendacoes

- Alertas de risco pedagogico por turma/professor.
- Sugerir melhorias de planejamento com base em historico real.
- Indicadores de aderencia curricular e cobertura de conteudo.

### Criterio de conclusao da fase

- IA atuando como apoio estruturado, auditavel e util para decisao pedagogica.

---

## Backlog tecnico transversal

- Padronizar labels pt-BR em toda a UI.
- Unificar design tokens e status colors.
- Estruturar testes e2e (Playwright/Cypress).
- CI com lint + type-check + testes.
- Seeds consistentes de dados para homologacao.

---

## Ordem recomendada das proximas entregas (sprint imediato)

1. Corrigir encoding pt-BR + mensagens de erro.
2. Fechar CRUD de matriculas.
3. Fechar modulo de avaliacoes/notas.
4. Adicionar edicao/exclusao de avisos no mural.
5. Implementar testes dos fluxos criticos.
