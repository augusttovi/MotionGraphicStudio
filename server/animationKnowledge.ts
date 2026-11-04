import type { RenderTechnology } from "../src/shared/motionStudioContracts.ts";

/**
 * Conhecimento profissional de Animação, Composição, Renderização Adaptativa Determinística
 * e Autoavaliação Técnica do MALA.SOMBRE Motion Studio.
 */

export const PROFESSIONAL_ANIMATION_PRINCIPLES = `
## DOMÍNIO PROFISSIONAL DE MOTION DESIGN (APLICAÇÃO INTENCIONAL)

1. TIMING, SPACING E FÍSICA DE MOVIMENTO:
- Timing & Ritmo: Alterne momentos de aceleração energética com pausas intencionais de leitura (holds). Nunca mantenha tudo se movendo na mesma velocidade constante.
- Easing Consciente: Escolha a curva certa para a intenção física:
  * Ease-Out Quint/Expo (1 - Math.pow(1 - p, 4)): chegadas elegantes de UI, textos, cartões e câmeras.
  * Ease-In-Out Cubic: deslocamentos de câmera, rotas de mapas e transições contínuas entre estados.
  * Overshoot / Mola Amortecida (1 - Math.exp(-damping * p) * Math.cos(freq * p)): entradas expressivas, confirmações táteis e destaques pontuais.
- Antecipação & Follow-Through: Antes de um movimento amplo ou impacto, aplique leve recuo preparatório (antecipação); após a parada do corpo principal, permita acomodação secundária (follow-through / secondary motion).
- Stagger (Escalonamento): Revele grupos (barras de gráfico, itens de lista, palavras-chave, nós de fluxograma) com defasagem controlada (ex: 0.06s a 0.14s por item) para guiar o olho.
- Movimento em Arcos & Squash/Stretch: Evite trajetórias robóticas puramente lineares em animações orgânicas ou de personagens; use curvas quadráticas/Bezier suaves.

2. COMPOSIÇÃO, HIERARQUIA E ÁREA SEGURA ADAPTATIVA:
- Ponto Focal Único por Instante: O espectador deve saber exatamente para onde olhar em menos de 0.5s. Estabeleça hierarquia clara por escala, contraste e espaço negativo.
- Regra dos Terços vs Centralização Intencional: Use centralização (960, 540) para títulos monumentais, logos e impactos simétricos; use terços (X ≈ 640 ou 1280; Y ≈ 360 ou 720) para narrativas com personagens, comparativos split-screen e mapas comentados.
- Área Segura Adaptativa (1920×1080): Mantenha textos essenciais, rótulos de gráficos, rostos/ícones principais e destinos dentro da zona segura (X entre 160 e 1760, Y entre 140 e 940), evitando cortes nas extremidades ou colisões entre rótulos.
- Paleta Guiada pelo Conteúdo: Escolha a paleta cromática de acordo com o tema, tom emocional e estilo visual (ex: marfim/tinta para Whiteboard ou Editorial; ardósia/ciano/esmeralda para Dados; claro limpo para Simulação Google; preto/violeta dramático quando o roteiro for sombrio/mistério). Se o usuário pedir cores específicas, obedeça integralmente.
- Regra Fundamental de Contenção Estética: NÃO force todas as técnicas em todas as cenas. Uma cena minimalista ou analítica deve ser limpa — só adicione partículas, glitch, glow ou distorção quando justificados pela narrativa e pelo estilo escolhido.
`.trim();

export function getTechnologyExecutionGuide(preferredTech: RenderTechnology): string {
  const techSpecific: Record<RenderTechnology, string> = {
    canvas2d: `
- TECNOLOGIA SELECIONADA — CANVAS 2D (<canvas width="1920" height="1080">):
  * Estilize o canvas com CSS responsivo centralizado no viewport escuro/neutro (width: 100vw; height: 100vh; object-fit: contain; display: block).
  * No início de window.seek(t), sempre resete o estado do contexto (ctx.setTransform(1,0,0,1,0,0), ctx.globalAlpha = 1, ctx.globalCompositeOperation = 'source-over', ctx.shadowBlur = 0, ctx.setLineDash([])) antes de redesenhar o quadro completo do instante t.
  * Meça textos com ctx.measureText para dimensionar caixas, tarjas e evitar qualquer estouro.`,
    svg: `
- TECNOLOGIA SELECIONADA — SVG VETORIAL (<svg id="stage-svg" viewBox="0 0 1920 1080" width="1920" height="1080">):
  * Centralize o SVG de forma responsiva ocupando 100vw × 100vh (max-width: 100vw; max-height: 100vh) com fundo explícito (<rect width="1920" height="1080" fill="..."> como primeiro filho do SVG para captura perfeita de frames).
  * Atualize atributos vetoriais (transform, opacity, stroke-dashoffset, d, clip-path, textContent) diretamente dentro de window.seek(t) em função pura de t. Não dependa de animações SMIL (<animate>) ou keyframes CSS autônomos desconectados de seek(t).`,
    "html-css": `
- TECNOLOGIA SELECIONADA — COMPOSIÇÃO HTML/CSS SINCRONIZADA + ESPELHO DE PALCO 1920×1080:
  * Construa um container fixo de palco #stage (width: 1920px; height: 1080px; position: relative; overflow: hidden) escalado proporcionalmente na janela via CSS transform scale(min(innerWidth/1920, innerHeight/1080)).
  * Controle TODAS as posições, opacidades, textos digitados, barras e estados de componentes via JavaScript dentro de window.seek(t) usando estilos inline determinísticos (transform, opacity). Proibido usar CSS transition ou @keyframes autônomos que ignorem chamadas fora de ordem de seek(t).`,
    hybrid: `
- TECNOLOGIA SELECIONADA — HÍBRIDA (CANVAS 2D 1920×1080 + CAMADAS SVG VETORIAIS):
  * Combine um <canvas width="1920" height="1080"> para atmosfera, fundo, gráficos contínuos ou partículas com um <svg viewBox="0 0 1920 1080"> sobreposto e alinhado milimetricamente para vetores nítidos, rotas, ícones, personagens ou UI.
  * Sincronize ambas as camadas exclusivamente dentro de window.seek(t).`,
  };

  return `
## CONTRATO TÉCNICO DETERMINÍSTICO E COMPATIBILIDADE TOTAL

1. CONTRATO OBRIGATÓRIO DE REPRODUÇÃO E EXPORTAÇÃO:
- Defina \`window.DURATION = <numero_em_segundos>\` no escopo global (ex: \`window.DURATION = 16.5;\`).
- Defina \`window.seek = function(t) { ... }\` no escopo global.
- Determinismo Puro e Acesso Fora de Ordem: \`window.seek(t)\` DEVE produzir exatamente o mesmo estado visual para o mesmo \`t\`, mesmo quando chamado repetidamente ou fora da ordem cronológica (ex: seek(8.4) -> seek(1.2) -> seek(8.4)).
- É PROIBIDO depender de estado acumulado frame a frame (ex: \`x += vx\`), \`Math.random()\`, \`Date.now()\`, \`setInterval\` ou \`setTimeout\` para lógica visual. Para variações pseudoaleatórias (partículas, ruído, textura), use hash matemático puro de semente fixa: \`const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };\`.
- Não registre loops \`requestAnimationFrame\` obrigatórios que sobrescrevam o controle externo; o estúdio e o player standalone já gerenciam a reprodução chamando \`window.seek(t)\` (se desejar incluir um loop inicial, chame \`seek(0)\` imediatamente ao carregar).

2. DIRETRIZ DA TECNOLOGIA DE RENDERIZAÇÃO:
${techSpecific[preferredTech]}
`.trim();
}

export const SELF_EVALUATION_CHECKLIST = `
## AUTOAVALIAÇÃO DE QUALIDADE OBRIGATÓRIA ANTES DE ENTREGAR O HTML

Verifique rigorosamente estes 14 critérios antes de emitir o código final:
1. O conteúdo está 100% fiel ao roteiro (sem inventar fatos, números ou citações ausentes)?
2. A direção de arte e a paleta escolhida são apropriadas ao tema e ao tom emocional?
3. A composição de cada cena possui hierarquia visual clara e ponto focal definido?
4. Todo movimento possui intenção narrativa/comunicativa clara (sem efeitos gratuitos)?
5. O timing alterna transições fluidas com tempo real de leitura e compreensão?
6. Há continuidade visual e narrativa entre as cenas (transições coerentes, sem lacunas ou telas vazias acidentais)?
7. Todos os textos obrigatórios são perfeitamente legíveis, com contraste forte e sem sobreposição indevida?
8. Os elementos estão alinhados e contidos na área segura 1920×1080 sem vazamentos ou cortes?
9. As transições conectam cenas com fluidez apropriada ao estilo?
10. Elementos decorativos desnecessários foram eliminados?
11. \`window.seek(t)\` é 100% determinístico e funciona inclusive fora de ordem cronológica?
12. \`window.DURATION\` reflete com precisão o término real da última cena?
13. O documento HTML é 100% autocontido (sem imagens externas quebradas; apenas Google Fonts opcionais)?
14. A estrutura (Canvas 2D / SVG / HTML de palco 1920×1080) é limpa, enxuta e compatível com preview e exportação de frames?
`.trim();
