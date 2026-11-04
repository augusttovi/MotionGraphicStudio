# Design System Universal MALA.SOMBRE — Atualização Definitiva do Motor de Renderização

Atualização integral da instrução mestre do motor de geração para transformá-lo em um **Motor de Renderização de Motion Graphics Universal**, traduzindo qualquer roteiro cronometrado em animações HTML5/Canvas 2D (`1920×1080`) 100% determinísticas via `window.seek(t)`, com física de molas amortecidas, continuidade matemática e orçamento estrito de até 250 linhas.

## Revisão e Decisões Confirmadas

> [!IMPORTANT]
> As decisões abaixo refletem exatamente as escolhas confirmadas no alinhamento prévio e regem a execução no servidor.

- **Decisão Confirmada 1 — Substituição 100% Literal da System Instruction**: A instrução de sistema atual será integralmente substituída pelo texto exato enviado entre `[INÍCIO DA SYSTEM INSTRUCTION]` e `[FIM DA SYSTEM INSTRUCTION]`, sem acréscimos ou notas paralelas, consolidando os 6 pilares do Design System Universal MALA.SOMBRE.
- **Decisão Confirmada 2 — Sincronização do Wrapper do Prompt de Roteiro**: O envelope textual que envolve o roteiro do usuário na rota de geração será alinhado ao novo contrato (referenciando o Design System Universal e o teto unificado de **no máximo 250 linhas totais** do arquivo HTML gerado, eliminando qualquer ambiguidade com a menção anterior a linhas exclusivas de script).
- **Escopo Preservado e Entrega Enxuta**: A cascata de provedores (Gemini 3.8 Flash com `GEMINI_API_KEY2` prioritária → OpenRouter Free → NVIDIA, com timeout de 90s), o cálculo auxiliar de `window.DURATION` (último timestamp + `1.5s`), o módulo de captura de quadros em 60fps e o logotipo da marca na interface permanecem intactos. Ao concluir a execução, a resposta exibirá apenas o código do backend que foi alterado.

---

## 1. Visão Geral e Conceito Central

- **O Que Faz**: Atua como um compilador criativo universal no servidor que lê qualquer roteiro narrativo ou `[AÇÃO CRONOMETRADA]` e sintetiza uma cena Canvas 2D `1920×1080` autocontida, governada por `window.seek(t)` puro, física analítica de molas, câmera parallax e abstração geométrica rigorosa.
- **Público e Contexto de Uso**: Diretores de arte e criadores do canal **MALA.SOMBRE** que precisam transformar roteiros variados em cenas consistentes, legíveis e livres de artefatos amadores (como teleporte por blocos de `if`, vazamento de texto nas bordas, desenhos anatômicos improvisados ou timeouts de geração).
- **Valor Principal**: Unifica direção de arte, engenharia matemática de movimento e controle de tamanho de código (máximo de 250 linhas) em uma única especificação determinística que funciona de forma previsível tanto no preview interativo quanto na exportação quadro a quadro em 60fps.

---

## 2. Experiência do Usuário e Design Visual

### Fluxo do Criador no Estúdio
1. **Entrada de Qualquer Roteiro Cronometrado**: O usuário cola o roteiro com marcações de tempo (incluindo blocos `[AÇÃO CRONOMETRADA]`, transições de interface, mapas táticos, impactos ou tipografia cinética) no painel de edição.
2. **Síntese pelo Motor Universal**: Ao acionar **"Gerar Motion Graphic"**, o servidor combina a nova **System Instruction Universal** com o wrapper sincronizado de roteiro e a dica dinâmica de duração (`último timestamp + 1.5s`), despachando a requisição para a cascata de IA.
3. **Validação Determinística no Palco 16:9**: A cena resultante é renderizada em `1920×1080` com centralização exata (`X=960, Y=540`), movimentos contínuos interpolados por progresso, entradas por mola amortecida e textos contidos via `ctx.measureText`. O usuário inspeciona qualquer instante na barra `seek(t)`.
4. **Exportação Pronta para Produção**: O criador baixa o HTML autocontido ou exporta a sequência de quadros PNG em 60fps sem divergência entre preview e renderização final.

### Identidade Visual (Estúdio & Design System de Renderização)
- **Direção Estética**: Sala de corte noturna (*darkroom cinema studio*) na interface web combinada a **Motion Graphics Abstrato Editorial/HUD** no Canvas 2D gerado — proscrevendo tentativas realistas de pessoas, animais ou veículos em favor de geometria limpa, silhuetas chapadas, linhas de radar e luz volumétrica.
- **Paleta e Orçamento de Cor (60-30-10)**:
  - `--background` (60%): Preto absoluto `#000000` no Canvas `1920×1080` e `#050507` na moldura do estúdio, garantindo contraste máximo para composição em modo `'screen'`.
  - `--surface` (30%): Roxo Profundo `#2a0033` para camadas atmosféricas, painéis táticos, névoa e superfícies estruturais discretas com divisórias finas.
  - `--accent` (10%): Violeta Luminoso `#8a2be2` para feixes de luz (*God Rays*), traçados progressivos e foco interativo, aliado ao Branco `#ffffff` para tipografia principal e leitura nítida.
- **Tipografia e Contenção Espacial**:
  - *No Canvas Renderizado*: **Bebas Neue** para títulos de impacto e **Oswald** para subtítulos/elementos de UI, sempre ancorados com `ctx.textAlign = 'center'`, `ctx.textBaseline = 'middle'` no centro `(960, 540)` e validados com `ctx.measureText` para zero vazamento entre `0` e `1920`.
  - *Na Interface do Estúdio*: **Oswald** nos cabeçalhos, **Plus Jakarta Sans** na área de roteiro e **JetBrains Mono** (`tabular-nums`) nos contadores de tempo e progresso.
- **Física e Micro-Interações da Cena**:
  - *Continuidade*: Progresso normalizado contínuo (`prog = (t - start) / duration`) em substituição a saltos discretos.
  - *Molas Analíticas*: Transições regidas por mola amortecida `1 - Math.exp(-damping * t) * Math.cos(freq * t)`.
  - *Traçado Progressivo & Impactos*: Revelação gradual por `ctx.setLineDash` / arcos parciais, parallax multicamada via `ctx.translate` + `ctx.scale` e vibrações determinísticas (`Math.sin(t * 100)`) nos instantes exatos do roteiro.

---

## 3. Decisões de Produto e Trade-Offs

- **Adoção Integral e Literal do Design System de 6 Pilares**
  - *Abordagem Escolhida*: Substituir toda a instrução anterior pela especificação canônica de 6 seções (Contrato Determinístico, Direção de Arte/Layout, Física de Movimento/Molas/Parallax, Componentes Visuais/Anti-Timeout, Leitura Cronometrada e Loop de Crítica).
  - *Por Quê*: Regras excessivamente fragmentadas ou contraditórias faziam os modelos desperdiçarem tokens ou ignorarem posicionamento central; uma especificação coesa e enxuta atua como um contrato universal para qualquer tema de roteiro.
  - *Alternativas Descartadas*: Acumular remendos incrementais específicos por cena, o que inflava o prompt de sistema e diluía a atenção do modelo.

- **Alinhamento entre System Instruction e Wrapper do Roteiro (Teto Único de 250 Linhas)**
  - *Abordagem Escolhida*: Ajustar também a mensagem de usuário montada na rota de geração para exigir um arquivo HTML completo, limpo e comentado com **no máximo 250 linhas totais**, espelhando exatamente a Seção 1 e a Seção 6 da nova System Instruction.
  - *Por Quê*: Evita instruções conflitantes entre o prompt de sistema ("no máximo 250 linhas") e o envelope do roteiro ("250 linhas de JavaScript"), reduzindo drasticamente o risco de respostas longas que esbarrem no timeout dos provedores.
  - *Alternativas Descartadas*: Manter o texto antigo no envelope do roteiro, o que criaria ambiguidade sobre o limite real permitido na auto-avaliação do modelo.

---

## 4. Arquitetura Técnica e Estratégia de Dados

### Diagrama de Arquitetura do Motor Universal

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     INTERFACE DO ESTÚDIO (Cliente Web)                     │
│                                                                            │
│  ┌──────────────────────────────┐      ┌────────────────────────────────┐  │
│  │ Editor de Roteiro            │      │ Palco 16:9 & Controles seek(t) │  │
│  │ • Texto + [AÇÃO CRONOMETRADA]├─────►│ • Preview Determinístico       │  │
│  │ • Estimativa de Duração      │      │ • Baixar HTML / Frames 60fps   │  │
│  └──────────────┬───────────────┘      └───────────────▲────────────────┘  │
└─────────────────┼──────────────────────────────────────┼───────────────────┘
                  │ POST (roteiro)                       │ HTML Autocontido
┌─────────────────▼──────────────────────────────────────┴───────────────────┐
│                    SERVIDOR DE RENDERIZAÇÃO (Backend)                      │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Preparação Sincronizada do Prompt                                 │  │
│  │    • Inferência de Duração: último timestamp + 1.5s de respiro       │  │
│  │    • Wrapper do Roteiro alinhado: Design System Universal (≤ 250 l.) │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 2. System Instruction Universal MALA.SOMBRE (Literal — 6 Pilares)    │  │
│  │    [1] Determinismo seek(t), hash trigonométrico, ≤ 250 linhas       │  │
│  │    [2] Paleta MALA.SOMBRE, Centro (960,540), Anti-vazamento          │  │
│  │    [3] Progresso contínuo, Molas amortecidas, Câmera Parallax        │  │
│  │    [4] Abstração geométrica, ≤ 30 partículas, Traçado progressivo    │  │
│  │    [5] Fidelidade à [AÇÃO CRONOMETRADA] e impactos matemáticos       │  │
│  │    [6] Loop de Crítica mental antes da emissão do HTML               │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 3. Cascata Resiliente de Provedores (Timeout 90s)                    │  │
│  │    1º Gemini 3.8 Flash (GEMINI_API_KEY2 || GEMINI_API_KEY, Low)      │  │
│  │    2º OpenRouter Free Router ("openrouter/free")                     │  │
│  │    3º NVIDIA NIM ("nvidia/nemotron-3-ultra-550b-a55b")               │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 4. Sanitização & Injeção do Exportador Determinístico (JSZip 60fps)  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Modelo de Estado e Fluxo de Execução no Servidor
- **Constante Mestre de Sistema**: Contém de forma 100% literal os 6 blocos da especificação Universal MALA.SOMBRE fornecida, atuando como instrução de sistema idêntica em todos os provedores da cascata (Gemini, OpenRouter e NVIDIA).
- **Construção do Prompt de Usuário**: Encapsula o roteiro limpo junto à observação de duração calculada (`último timestamp + 1.5s`) e reforça o teto de **no máximo 250 linhas** e retorno exclusivo do documento HTML autocontido.
- **Pós-Processamento Determinístico**: Extrai o documento `<!DOCTYPE html>` limpo (removendo eventuais cercas markdown ou blocos `<think>`), valida a presença de `<canvas>` e `<script>` e anexa o módulo leve de captura quadro a quadro sem alterar a lógica pura de `window.seek(t)`.
