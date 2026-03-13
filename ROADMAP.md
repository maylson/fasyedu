# ROADMAP FASY

## Objetivo

Consolidar o FASY como plataforma de gestão pedagógica multiescola para operação real de escolas brasileiras, com foco em planejamento, acompanhamento e comunicação.

## Horizonte e prioridade

- Curto prazo: estabilização e fechamento do MVP operacional.
- Médio prazo: escala multiescola, analytics e fluxo acadêmico completo.
- Longo prazo: inteligência pedagógica e governança institucional.

---

## Fase 1 - Estabilização do MVP (prioridade máxima)

### 1.1 Qualidade e confiabilidade

- Corrigir encoding em toda a interface (pt-BR consistente).
- Revisar mensagens de erro para linguagem de usuário final.
- Cobertura mínima de testes:
  - ações críticas (`academic.ts`, `users.ts`, `settings.ts`);
  - fluxos de autenticação;
  - fluxo de planejamento + Wizard.
- Hardening de validações server-side em todos os formulários.

### 1.2 Fluxos essenciais pendentes

- Matrículas:
  - cadastro/edição/cancelamento;
  - regras por ano letivo/turma/vagas.
- Avaliações:
  - criação de avaliação, itens e notas;
  - composição de média e relatórios básicos.
- Alunos e Pais:
  - gestão completa de responsáveis e vínculos;
  - filtros, edição e ficha completa.
- Migração de dados legados:
  - importar planejamentos antigos com rastreabilidade;
  - tratar pendências de mapeamento turma/horário/professor.

### 1.3 Mural e calendário

- Edição/exclusão de avisos no mural.
- Confirmações visuais padronizadas em todas as ações.
- Melhorias de desempenho na timeline em volumes altos (paginação/cursor).

### Critério de conclusão

- Escola consegue operar ciclo semanal (`horários -> planejamento -> coordenação -> comunicação`) sem falhas críticas.

---

## Fase 2 - Operação acadêmica completa

### 2.1 Planejamento e coordenação

- Histórico completo de versões do plano de aula.
- Trilha de auditoria (quem alterou status, quando e motivo).
- Fila de revisão com filtros por professor/turma/série/status.
- Painel de indicadores pedagógicos por turma/professor.

### 2.2 Notas e avaliação formativa

- Rubricas e critérios por disciplina/turma.
- Boletim por período.
- Exportação (PDF/CSV) para coordenação e direção.

### 2.3 Experiência de usuário

- Melhorias responsivas mobile-first em telas densas.
- Componentes padronizados de loading, feedback e confirmação.
- Acessibilidade (teclado, contraste e foco).

### Critério de conclusão

- Operação acadêmica completa do período letivo dentro do sistema.

---

## Fase 3 - Escala multiescola e governança

### 3.1 Backoffice FASY

- Gestão centralizada de escolas (onboarding, habilitação de módulos, limites).
- Parâmetros por escola:
  - recursos pedagógicos;
  - políticas de IA;
  - templates institucionais.

### 3.2 Observabilidade e segurança

- Logs estruturados por módulo/ação.
- Alertas de erro e disponibilidade.
- Auditoria de acesso e eventos sensíveis.
- Revisão de RLS e políticas para cenários edge.

### 3.3 Performance

- Paginação em listas grandes.
- Caching de consultas de dashboard.
- Otimização de queries com índices orientados ao uso real.

### Critério de conclusão

- Operação segura de múltiplas escolas simultâneas com governança central.

---

## Fase 4 - Inteligência pedagógica

### 4.1 IA aplicada com governança

- Biblioteca de prompts versionada por escola.
- Políticas de moderação e trilha de decisões de IA.
- Score pedagógico explicável por critério.

### 4.2 Insights e recomendações

- Alertas de risco pedagógico por turma/professor.
- Sugestões de melhoria com base em histórico real.
- Indicadores de aderência curricular e cobertura de conteúdo.

### Critério de conclusão

- IA atuando como apoio estruturado, auditável e útil para decisão pedagógica.

---

## Backlog técnico transversal

- Padronizar labels pt-BR em toda a UI.
- Unificar design tokens e cores de status.
- Estruturar testes E2E (Playwright/Cypress).
- CI com lint + type-check + testes.
- Seeds consistentes para homologação.

---

## Próximas entregas recomendadas (sprint imediato)

1. Finalizar correção de encoding pt-BR e mensagens de erro.
2. Fechar CRUD completo de matrículas.
3. Fechar módulo de avaliações/notas.
4. Consolidar migração dos planejamentos legados com validação de pendências.
5. Implementar testes dos fluxos críticos.
