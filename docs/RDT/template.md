# RDT-XXX: [Título Descritivo da Decisão]

**Data:** AAAA-MM-DD
**Status:** Proposto | Aceito | Rejeitado | Substituído | Depreciado
**Contexto:** [Módulo/Área do Sistema]
**Decisores:** @nome1, @nome2

## Contexto

[Descreva o problema ou situação que requer uma decisão técnica]

**Exemplo:**

> Precisamos escolher um sistema de armazenamento de arquivos para o módulo de gestão de documentos do DETRAN. Atualmente armazenamos no sistema de arquivos local, mas isso não escala e dificulta backup/replicação.

## Decisão

[Descreva claramente a decisão tomada]

**Exemplo:**

> Utilizaremos MinIO como solução de object storage, integrado ao Directus via adapter customizado.

## Alternativas Consideradas

### Opção 1: [Nome da Alternativa]

- **Prós:**
  - Pró 1
  - Pró 2
- **Contras:**
  - Contra 1
  - Contra 2

### Opção 2: [Nome da Alternativa]

- **Prós:**
  - Pró 1
  - Pró 2
- **Contras:**
  - Contra 1
  - Contra 2

### Opção 3: [Nome da Alternativa escolhida]

- **Prós:**
  - Pró 1
  - Pró 2
- **Contras:**
  - Contra 1
  - Contra 2

## Tradeoffs

### O que ganhamos

- Benefício 1
- Benefício 2
- Benefício 3

### O que perdemos

- Limitação 1
- Limitação 2
- Limitação 3

### O que aceitamos como compromisso

- Compromisso 1 (ex: maior complexidade operacional)
- Compromisso 2 (ex: curva de aprendizado)
- Compromisso 3

## Consequências

### Positivas

- Consequência positiva 1
- Consequência positiva 2

### Negativas

- Consequência negativa 1
- Consequência negativa 2

### Neutras

- Mudança que não é boa nem ruim, apenas diferente
- Impacto em área específica que requer atenção

## Detalhes de Implementação

[Opcional - informações técnicas relevantes para implementação]

**Exemplo:**

> - Configurar bucket `documentos-detran` no MinIO
> - Criar extensão Directus para upload/download
> - Implementar política de retenção de 7 anos (conforme legislação)

## Riscos e Mitigações

[Opcional - riscos identificados e como serão tratados]

| Risco                   | Probabilidade | Impacto | Mitigação                  |
| ----------------------- | ------------- | ------- | -------------------------- |
| Exemplo: Perda de dados | Baixa         | Alto    | Backup diário + replicação |

## Links Relacionados

- [RDT-XXX: Decisão relacionada](#)
- [Documentação externa](https://exemplo.com)
- [Issue/Task relacionada](#)

## Histórico de Revisões

| Data       | Autor | Mudança              |
| ---------- | ----- | -------------------- |
| AAAA-MM-DD | @nome | Criação do documento |

---

## Notas

[Espaço para observações adicionais, contexto específico do projeto, ou informações que não se encaixam nas seções acima]
