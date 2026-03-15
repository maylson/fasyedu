# ROADMAP FASY

## Objetivo

Consolidar o FASY como plataforma de gestão pedagógica multiescola para operação real de escolas brasileiras, com foco em planejamento, acompanhamento e comunicação.

## Horizonte e prioridade

- Curto prazo: estabilização e fechamento do MVP operacional.
- Médio prazo: escala multiescola, analytics e fluxo acadêmico completo.
- Longo prazo: inteligência pedagógica e governança institucional.

---

## Fase 1 - Estabilização do MVP

### 1.1 Qualidade e confiabilidade

- Corrigir encoding em toda a interface.
- Revisar mensagens de erro para linguagem de usuário final.
- Cobertura mínima de testes para:
  - `academic.ts`
  - `users.ts`
  - `settings.ts`
  - fluxo de autenticação
  - fluxo de planejamento + Wizard
- Hardening de validações server-side em todos os formulários.

### 1.2 Fluxos essenciais

- Matrículas:
  - filtros e paginação
  - regras por ano letivo, turma e vagas
  - prevenção de conflitos e duplicidades
- Avaliações:
  - criação de avaliação, itens e notas
  - composição de média
  - relatórios básicos por turma, aluno e disciplina
- Alunos e pais:
  - concluir CRUD completo
  - upload e gestão de foto
  - edição de responsáveis e vínculos
  - filtros e ficha completa
- Migração de dados legados:
  - consolidar rastreabilidade
  - tratar pendências de mapeamento turma/horário/professor

### 1.3 Comunicação escolar

- Mural:
  - edição e exclusão consistentes
  - melhor paginação/cursor para volumes altos
- Calendário:
  - edição completa de eventos
  - refinamento de segmentação por etapa, série e turma

### Critério de conclusão

- A escola consegue operar o ciclo semanal `horários -> planejamento -> coordenação -> agenda/mural/calendário` sem falhas críticas.

---

## Fase 2 - Operação acadêmica completa

### 2.1 Planejamento e coordenação

- Histórico completo de versões do plano de aula.
- Trilha de auditoria de alteração de status.
- Fila de revisão com filtros avançados.
- Painel de indicadores pedagógicos por turma e professor.

### 2.2 Notas e avaliação formativa

- Rubricas e critérios por disciplina/turma.
- Boletim por período.
- Exportação em PDF/CSV para coordenação e direção.

### 2.3 Experiência de usuário

- Melhorias responsivas mobile-first nas telas densas.
- Componentes padronizados de loading, feedback e confirmação.
- Acessibilidade: teclado, contraste e foco.

### Critério de conclusão

- Operação acadêmica completa do período letivo dentro do sistema.

---

## Fase 3 - Escala multiescola e governança

### 3.1 Backoffice FASY

- Gestão centralizada de escolas.
- Onboarding e habilitação de módulos.
- Parâmetros por escola:
  - recursos pedagógicos
  - políticas de IA
  - templates institucionais

### 3.2 Observabilidade e segurança

- Logs estruturados por módulo e ação.
- Alertas de erro e disponibilidade.
- Auditoria de acesso e eventos sensíveis.
- Revisão contínua de RLS e cenários edge.

### 3.3 Performance

- Paginação em listas grandes.
- Caching de dashboards.
- Otimização de queries e índices.

### Critério de conclusão

- Operação segura de múltiplas escolas simultâneas com governança central.

---

## Fase 4 - Inteligência pedagógica

### 4.1 IA aplicada com governança

- Biblioteca de prompts versionada por escola.
- Políticas de moderação e trilha de decisões da IA.
- Score pedagógico explicável por critério.

### 4.2 Insights e recomendações

- Alertas de risco pedagógico por turma e professor.
- Sugestões de melhoria com base em histórico real.
- Indicadores de aderência curricular e cobertura de conteúdo.

### Critério de conclusão

- IA atuando como apoio estruturado, auditável e útil para decisão pedagógica.

---

## Backlog técnico transversal

- Padronizar labels pt-BR em toda a UI.
- Unificar design tokens e cores de status.
- Estruturar testes E2E.
- CI com lint, type-check e testes.
- Seeds consistentes para homologação.

---

## Próximas entregas recomendadas

1. Finalizar correção de encoding e mensagens de erro.
2. Fechar CRUD completo de matrículas.
3. Evoluir avaliações para médias e boletins.
4. Consolidar migração dos planejamentos legados com validação final.
5. Implementar testes dos fluxos críticos.
