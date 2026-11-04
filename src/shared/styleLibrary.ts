import type {
  MotionStyleSpec,
  StyleCategory,
  StyleId,
} from "./motionStudioContracts.ts";

export interface StyleCategoryDefinition {
  id: StyleCategory;
  label: string;
  specializationRules: string;
}

export const STYLE_CATEGORIES: StyleCategoryDefinition[] = [
  {
    id: "storytelling",
    label: "Storytelling e Explicação",
    specializationRules:
      "Priorize clareza narrativa, progressão visual causa-efeito, poses legíveis, antecipação antes de ações importantes, arcos naturais e sincronização rigorosa entre ilustração/ícone e texto explicativo.",
  },
  {
    id: "data",
    label: "Dados e Informação",
    specializationRules:
      "Garanta fidelidade matemática proporcional aos valores do roteiro, eixos/escalas legíveis, revelação ordenada de dados (stagger controlado), rótulos tabulares sem sobreposição e hierarquia clara entre destaque numérico e contexto.",
  },
  {
    id: "social",
    label: "Social e Viral",
    specializationRules:
      "Capture atenção nos primeiros 0.8s com gancho visual claro, ritmo energético, tipografia de alto impacto, microinterações autênticas de interface ou efeitos estilísticos intencionais sem prejudicar a leitura.",
  },
  {
    id: "branding",
    label: "Branding e Identidade",
    specializationRules:
      "Foque em refinamento geométrico, curvas de aceleração elegantes, espaço negativo generoso, revelação escultural de formas/símbolos e acabamento editorial memorável.",
  },
  {
    id: "product",
    label: "Produto, Interface e Tecnologia",
    specializationRules:
      "Construa componentes consistentes com estados reais de UI (foco, hover, clique, confirmação), espaçamento preciso em grid, cursores/indicadores intencionais e feedback visual imediato.",
  },
  {
    id: "editing",
    label: "Edição e Transições",
    specializationRules:
      "Trabalhe continuidade de vetor de movimento (match-cut, whip, mask wipe), camadas de atmosfera equilibradas, terços inferiores limpos para broadcast e texturas em loop matematicamente perfeitas.",
  },
  {
    id: "experimental",
    label: "Experimental e Editorial",
    specializationRules:
      "Combine direção de arte autoral, recortes/colagens texturizadas, cadência stepped (stop-motion digital) ou destaque editorial de citações/provas sociais com forte personalidade gráfica.",
  },
];

export const MOTION_STYLE_LIBRARY: MotionStyleSpec[] = [
  // =========================================================================
  // STORYTELLING E EXPLICAÇÃO (1 - 5)
  // =========================================================================
  {
    id: "explainer-videos",
    index: 1,
    name: "Explainer Videos",
    category: "storytelling",
    categoryLabel: "Storytelling e Explicação",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Formas vetoriais limpas, ícones conceituais modulares, paleta clara ou alto contraste amigável, conectores visuais e foco em um conceito central por quadro.",
    compositionTypes:
      "Centro focal com suporte lateral em 2 colunas, progressão esquerda-para-direita de etapas e enquadramento limpo com amplo espaço negativo.",
    animationTechniques:
      "Morphing simples entre ícones conceituais, revelação por máscara (clip-path), entradas com overshoot suave e destaque sequencial (stagger).",
    typographyGuide:
      "Plus Jakarta Sans ou Outfit Bold para afirmações curtas; corpo legível em peso médio com palavras-chave destacadas por cor de acento.",
    signatureMovements:
      "Transição contínua onde um símbolo se transforma ou desliza para dar lugar à consequência lógica da explicação.",
    recommendedTransitions:
      "Mask wipe circular, deslizamento coordenado de câmera (pan horizontal) e escala a partir do elemento conector.",
    depthAndLayers:
      "2 a 3 planos limpos: fundo sólido/gradiente sutil, camada de suporte geométrico discreto e plano principal de ícones + texto.",
    recommendedElements: [
      "Ícones conceituais",
      "Setas e linhas pontilhadas",
      "Cartões de resumo",
      "Indicadores numéricos de passo (01, 02, 03)",
    ],
    bestUseCases:
      "Explicação de processos, produtos, conceitos abstratos, resumos educativos e apresentações institucionais.",
    technicalCautions:
      "Evite excesso de texto simultâneo; sincronize cada transformação visual com uma única ideia clara.",
    keywords: [
      "explicar",
      "como funciona",
      "passo a passo",
      "entenda",
      "conceito",
      "processo",
      "solução",
      "problema",
      "resumo",
    ],
  },
  {
    id: "illustration-character",
    index: 2,
    name: "Animações de Ilustração e Personagens",
    category: "storytelling",
    categoryLabel: "Storytelling e Explicação",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Ilustração vetorial estilizada com silhuetas expressivas, formas geométricas orgânicas bem proporcionadas, paleta coesa e cenários ilustrados em camadas.",
    compositionTypes:
      "Regra dos terços posicionando o personagem estilizado em um terço e a ação/ambiente ou texto narrativo nos dois terços restantes.",
    animationTechniques:
      "Antecipação, arcos de movimento nos gestos, respiração sutil senoidal, follow-through em acessórios/cabelo estilizado e poses-chave claras.",
    typographyGuide:
      "Bricolage Grotesque ou Oswald para títulos expressivos; legendas narrativas integradas ao cenário sem cobrir o personagem.",
    signatureMovements:
      "Mudança expressiva de postura com antecipação e acomodação elástica suave, acompanhada por leve movimento de câmera.",
    recommendedTransitions:
      "Corte em movimento, passagem de primeiro plano (foreground wipe) ou pan de câmera acompanhando o olhar/direção.",
    depthAndLayers:
      "Fundo atmosférico ilustrado, plano médio de cenário, plano do personagem e detalhe sutil em primeiro plano.",
    recommendedElements: [
      "Personagens vetoriais geométricos/estilizados",
      "Balões ou legendas editoriais",
      "Objetos de cena simbólicos",
      "Iluminação dramática ou suave",
    ],
    bestUseCases:
      "Narrativas centradas em jornadas humanas, dilemas, histórias, fábulas modernas e casos reais.",
    technicalCautions:
      "Construa personagens com geometria vetorial estilizada e intencional (SVG/Canvas limpo), mantendo proporções consistentes entre cenas.",
    keywords: [
      "personagem",
      "história",
      "jornada",
      "protagonista",
      "homem",
      "mulher",
      "viajante",
      "detetive",
      "narrativa",
    ],
  },
  {
    id: "paper-cutout-parallax",
    index: 3,
    name: "Paper Cutout & 2.5D Parallax",
    category: "storytelling",
    categoryLabel: "Storytelling e Explicação",
    preferredTechnology: "hybrid",
    visualCharacteristics:
      "Camadas recortadas simulando papel artesanal ou cartolina cenográfica, sombras projetadas suaves entre planos (drop-shadow), bordas orgânicas/chanfradas e textura sutil de grão.",
    compositionTypes:
      " Enquadramento teatral em profundidade (proscênio), molduras laterais de camadas próximas e ponto focal iluminado ao centro-fundo.",
    animationTechniques:
      "Parallax multi-plano com velocidades diferenciadas, leve oscilação pendular de recortes e zoom lento de câmera (dolly-in 2.5D).",
    typographyGuide:
      "Playfair Display, Fraunces ou Bebas Neue com sombra destacada como recorte físico sobre o plano médio.",
    signatureMovements:
      "Abertura de planos laterais como cortinas/silhuetas em velocidades distintas revelando o assunto central.",
    recommendedTransitions:
      "Fechamento de camada escura/colorida em primeiro plano cobrindo a lente para revelar novo cenário atrás.",
    depthAndLayers:
      "4 a 6 camadas explícitas (céu/fundo, horizonte, plano médio distante, plano focal, moldura frontal) com sombras coerentes.",
    recommendedElements: [
      "Silhuetas recortadas em camadas",
      "Sombras paralelas entre planos",
      "Textura sutil de papel granulado determinístico",
      "Iluminação entre camadas",
    ],
    bestUseCases:
      "Contos sombrios, documentários históricos, mistérios atmosféricos, aberturas cinematográficas e fábulas.",
    technicalCautions:
      "Calcule o deslocamento de cada camada como fração determinística do pan/zoom global para preservar a ilusão 2.5D.",
    keywords: [
      "mistério",
      "floresta",
      "noite",
      "sombrio",
      "conto",
      "histórico",
      "profundidade",
      "camadas",
      "teatro",
      "recorte",
    ],
  },
  {
    id: "character-rigging-puppet",
    index: 4,
    name: "Character Rigging / Puppet Animation",
    category: "storytelling",
    categoryLabel: "Storytelling e Explicação",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Personagem modular articulado em grupos hierárquicos (tronco, cabeça, braço superior, antebraço, pernas) com pivôs de rotação precisos (`transform-origin`).",
    compositionTypes:
      "Plano médio ou americano destacando linguagem corporal, gestos explicativos e interação com objetos/painéis ao lado.",
    animationTechniques:
      "Cinemática direta determinística (rotações encadeadas pai-filho baseadas em funções de tempo `t`), atraso secundário (overlap) entre ombro, cotovelo e mão.",
    typographyGuide:
      "Plus Jakarta Sans ou Oswald em painéis laterais sincronizados com o apontamento ou gesto do personagem.",
    signatureMovements:
      "Inclinação de tronco antecipando gesto de braço em arco, aceno de cabeça expressivo e troca de pose limpa.",
    recommendedTransitions:
      "Zoom suave para o painel apontado pelo personagem ou corte de câmera entre plano geral e plano médio.",
    depthAndLayers:
      "Fundo cenográfico minimalista, sombra de contato no chão, articulações ordenadas em z-index coerente.",
    recommendedElements: [
      "Membros articulados com juntas circulares limpas",
      "Expressões faciais modulares (olhos/sobrancelhas)",
      "Sombra elíptica ancorada ao solo",
    ],
    bestUseCases:
      "Apresentadores virtuais estilizados, tutoriais conduzidos por mascote/guia e cenas de atuação gestual.",
    technicalCautions:
      "Defina pivôs explícitos em coordenadas locais para evitar desconexão de membros durante rotações.",
    keywords: [
      "apresentador",
      "mascote",
      "gesto",
      "acenando",
      "apontando",
      "boneco",
      "articulado",
      "atuação",
    ],
  },
  {
    id: "whiteboard-animation",
    index: 5,
    name: "Whiteboard Animation",
    category: "storytelling",
    categoryLabel: "Storytelling e Explicação",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Fundo claro tipo quadro branco ou papel marfim (`#F9F8F4`), traços contínuos em tinta preta/azul-escura, destaques pontuais em marcador amarelo/violeta/vermelho.",
    compositionTypes:
      "Mapa mental progressivo no quadro ou organização em quadrantes visuais conectados por setas desenhadas ao vivo.",
    animationTechniques:
      "Desenho progressivo estrito de caminhos (`stroke-dasharray` e `stroke-dashoffset` baseados em `t`), cursor/ponta estilizada acompanhando o ponto ativo do traço e preenchimento sutil após o contorno.",
    typographyGuide:
      "Tipografia manuscrita limpa ou sans geométrica clara revelada palavra por palavra em sincronia com o diagrama.",
    signatureMovements:
      "Traçado fluido em ordem lógica de construção (contorno principal -> detalhes internos -> seta conectora -> rótulo).",
    recommendedTransitions:
      "Pan da câmera para área limpa do quadro branco ou apagamento/varredura rápida de seção.",
    depthAndLayers:
      "Superfície única de quadro com leve textura sutil, camada de traços vetoriais, camada de realce (marca-texto multiply) e indicador de ponta.",
    recommendedElements: [
      "Diagramas desenhados a traço",
      "Setas manuscritas",
      "Sublinhados e círculos de destaque",
      "Indicador de ponta de caneta opcional",
    ],
    bestUseCases:
      "Aulas, resumos de livros, explicações didáticas, raciocínios lógicos e vídeos educativos.",
    technicalCautions:
      "Calcule o comprimento exato dos caminhos SVG (`getTotalLength` ou valor normalizado `pathLength='1'`) para revelação sem saltos.",
    keywords: [
      "aula",
      "quadro branco",
      "didático",
      "educativo",
      "desenhando",
      "esquema",
      "estudo",
      "aprendizado",
      "resumo",
    ],
  },

  // =========================================================================
  // DADOS E INFORMAÇÃO (6 - 10)
  // =========================================================================
  {
    id: "3d-transforms-flowchart",
    index: 6,
    name: "Transformações 3D e Gráficos em Fluxograma",
    category: "data",
    categoryLabel: "Dados e Informação",
    preferredTechnology: "hybrid",
    visualCharacteristics:
      "Nós arquiteturais conectados em perspectiva CSS 3D (`perspective`, `rotateX`, `rotateY`) ou projeção axonométrica, pulsos luminosos viajando pelas conexões.",
    compositionTypes:
      "Grafo direcionado hierárquico (entrada -> processamento -> ramificações -> saída) com câmera acompanhando o nó ativo.",
    animationTechniques:
      "Inclinação 3D suave do plano do fluxograma, iluminação sequencial de nós ativos e partículas/traços viajando pelos conectores.",
    typographyGuide:
      "Plus Jakarta Sans SemiBold para títulos dos nós e JetBrains Mono para metadados, status e latências.",
    signatureMovements:
      "Câmera desliza e inclina suavemente do nó A ao nó B enquanto o pulso de conexão percorre a linha entre eles.",
    recommendedTransitions:
      "Rotação espacial de plano 3D ou zoom profundo através de um nó abrindo o sub-fluxo seguinte.",
    depthAndLayers:
      "Grade espacial de referência ao fundo, plano 3D dos cartões/nós com sombras suaves e feixes conectores luminosos.",
    recommendedElements: [
      "Cartões de nós com bordas nítidas",
      "Conectores ortogonais ou curvos animados",
      "Badges de etapa",
      "Grade espacial em perspectiva",
    ],
    bestUseCases:
      "Arquitetura de sistemas, funis de conversão, árvores de decisão, automações e cadeias causais.",
    technicalCautions:
      "Mantenha ângulos 3D moderados (até 22 graus) para preservar legibilidade perfeita dos textos nos nós.",
    keywords: [
      "fluxograma",
      "pipeline",
      "arquitetura",
      "etapas",
      "conexão",
      "sistema",
      "automação",
      "decisão",
      "fluxo",
    ],
  },
  {
    id: "animated-infographics",
    index: 7,
    name: "Animated Infographics",
    category: "data",
    categoryLabel: "Dados e Informação",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Layout editorial estruturado em blocos informativos, pictogramas proporcionais (isotype), anéis percentuais, ícones vetoriais e contadores numéricos tabulares.",
    compositionTypes:
      "Grid modular equilibrado (Bento informativo 2x2 ou 3 colunas) com cabeçalho contextual claro e hierarquia de leitura guiada.",
    animationTechniques:
      "Contagem progressiva interpolada de números (`tabular-nums`), preenchimento de anéis/barras com easing cúbico e entrada escalonada (stagger) de pictogramas.",
    typographyGuide:
      "Oswald ou Outfit para números grandes em destaque; Plus Jakarta Sans para legendas explicativas concisas.",
    signatureMovements:
      "Revelação coordenada de estatística principal seguida pelo preenchimento visual dos ícones proporcionais.",
    recommendedTransitions:
      "Divisórias de grid que deslizam reconfigurando as proporções para o próximo bloco de dados.",
    depthAndLayers:
      "Superfície limpa de alto contraste, divisórias de 1px precisas e elementos gráficos planos de leitura imediata.",
    recommendedElements: [
      "Anéis de progresso (donut)",
      "Matrizes de pictogramas (ex: 7 em cada 10)",
      "Contadores numéricos animados",
      "Linhas de chamada (callouts)",
    ],
    bestUseCases:
      "Relatórios visuais, estatísticas, curiosidades baseadas em números, pesquisas e jornalismo de dados.",
    technicalCautions:
      "Nunca invente números ausentes no roteiro; represente proporções fielmente aos dados fornecidos.",
    keywords: [
      "infográfico",
      "estatística",
      "porcentagem",
      "pesquisa",
      "dados",
      "relatório",
      "proporção",
      "números",
    ],
  },
  {
    id: "animated-maps",
    index: 8,
    name: "Mapas Animados",
    category: "data",
    categoryLabel: "Dados e Informação",
    preferredTechnology: "hybrid",
    visualCharacteristics:
      "Cartografia estilizada vetorial/tática com contornos geográficos reconhecíveis ou grade cartográfica com coordenadas, pinos de localização, anéis de radar e rotas curvas.",
    compositionTypes:
      "Enquadramento geográfico amplo com zoom progressivo na região de interesse, rótulos de cidades ancorados sem colisão e legenda de distância/tempo.",
    animationTechniques:
      "Traçado progressivo de rota em arco Bezier entre origem e destino, ícone direcional rotacionado pela tangente (`Math.atan2`), pulso concêntrico nos marcos e pan/zoom suave de câmera.",
    typographyGuide:
      "Oswald para nomes de países/cidades em caixa alta com espaçamento aberto (`letter-spacing`) e JetBrains Mono para coordenadas/distâncias.",
    signatureMovements:
      "Câmera acompanha suavemente o deslocamento contínuo da rota do ponto A ao ponto B, culminando na abertura do marcador de destino.",
    recommendedTransitions:
      "Zoom cartográfico (macro -> micro) ou transição por linhas de latitude/longitude.",
    depthAndLayers:
      "Base oceânica/terrestre, malha cartográfica, regiões destacadas, camada de rota luminosa e camada superior de pinos/labels.",
    recommendedElements: [
      "Trajetórias em arco progressivo",
      "Marcadores de origem e destino com pulso",
      "Escala cartográfica e bússola minimalista",
      "Rótulos geográficos com linha guia",
    ],
    bestUseCases:
      "Rotas de viagem, geopolítica, investigações criminais/históricas, expansão geográfica e logística.",
    technicalCautions:
      "Mantenha origem e destino dentro da área segura visível durante o enquadramento ativo e use progresso contínuo único para a rota.",
    keywords: [
      "mapa",
      "rota",
      "viagem",
      "voo",
      "país",
      "cidade",
      "fronteira",
      "geografia",
      "localização",
      "trajeto",
      "radar",
    ],
  },
  {
    id: "realtime-data-viz",
    index: 9,
    name: "Data Visualization em Tempo Real",
    category: "data",
    categoryLabel: "Dados e Informação",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Estética de terminal analítico moderno ou observatório de sinais: curvas contínuas de séries temporais, espectros, pontos de amostragem luminosos e indicadores de pico/anomalia.",
    compositionTypes:
      "Área principal ocupada pela curva dinâmica com eixo temporal claro e faixa superior/lateral de indicadores-chave.",
    animationTechniques:
      "Varredura contínua da curva de dados da esquerda para a direita com marcador luminoso na ponta ativa, bandas de confiança e destaque automático de picos/quedas.",
    typographyGuide:
      "JetBrains Mono (`tabular-nums`) para valores em tempo real, timestamps e deltas; Plus Jakarta Sans para títulos.",
    signatureMovements:
      "Acompanhamento fluido da cabeça de leitura da série temporal com destaque instantâneo ao atingir um evento crítico do roteiro.",
    recommendedTransitions:
      "Morphing matemático entre duas curvas de dados ou reescalonamento suave do eixo vertical.",
    depthAndLayers:
      "Fundo escuro analítico, grade milimetrada sutil, área preenchida em gradiente sob a curva, linha principal nítida e callouts de eventos.",
    recommendedElements: [
      "Gráfico de linha/área contínuo",
      "Marcadores de anomalia ou recorde",
      "Indicadores de variação (+% / -%)",
      "Eixos com escala real",
    ],
    bestUseCases:
      "Mercado financeiro, telemetria científica, evolução histórica ano a ano, picos de audiência e métricas vivas.",
    technicalCautions:
      "Interpolação determinística exata entre pontos de dados reais do roteiro; evite ruído aleatório que distorça os números citados.",
    keywords: [
      "tempo real",
      "evolução",
      "série temporal",
      "bolsa",
      "crescimento",
      "queda",
      "pico",
      "anomalia",
      "monitoramento",
    ],
  },
  {
    id: "animated-charts-comparisons",
    index: 10,
    name: "Animated Charts & Comparisons",
    category: "data",
    categoryLabel: "Dados e Informação",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Gráficos comparativos de alta clareza: barras horizontais/verticais, colunas agrupadas, comparativos lado a lado (A vs B) e rankings dinâmicos (bar chart race).",
    compositionTypes:
      "Alinhamento rigoroso pela linha de base (eixo zero), rótulos claros à esquerda/abaixo e valores finais ancorados na extremidade das barras.",
    animationTechniques:
      "Crescimento proporcional a partir do zero com overshoot sutil ou ease-out exponencial, reordenação suave de ranking e destaque cromático no vencedor/foco.",
    typographyGuide:
      "Plus Jakarta Sans Bold para categorias comparadas e JetBrains Mono Bold para valores exatos.",
    signatureMovements:
      "Crescimento escalonado das barras seguido de linha de referência comparativa evidenciando a diferença (ex: 3.4x maior).",
    recommendedTransitions:
      "Colapso elegante das barras para a linha base antes da entrada da nova comparação.",
    depthAndLayers:
      "Fundo limpo, linhas de grade de referência discretas, barras com destaque no item focal e camada de anotações.",
    recommendedElements: [
      "Barras proporcionais",
      "Eixos e linhas de meta",
      "Chaves comparativas de diferença",
      "Legendas diretas sem poluição",
    ],
    bestUseCases:
      "Comparações de desempenho, antes vs depois, rankings, preços, velocidades e resultados de testes.",
    technicalCautions:
      "A altura/largura de cada barra DEVE respeitar matematicamente a razão real entre os números fornecidos.",
    keywords: [
      "comparação",
      "versus",
      "vs",
      "gráfico",
      "barras",
      "ranking",
      "maior",
      "menor",
      "dobro",
      "diferença",
    ],
  },

  // =========================================================================
  // SOCIAL E VIRAL (11 - 16)
  // =========================================================================
  {
    id: "kinetic-text",
    index: 11,
    name: "Animações de Texto Cinético",
    category: "social",
    categoryLabel: "Social e Viral",
    preferredTechnology: "html-css",
    visualCharacteristics:
      "Tipografia como protagonista absoluta: contraste dramático de pesos, tamanhos gigantes combinados a palavras de apoio compactas, inversões instantâneas de cor fundo/texto.",
    compositionTypes:
      "Composição tipográfica blocada (swiss grid / brutalista limpa) ou centralização rítmica frase a frase.",
    animationTechniques:
      "Mask reveal vertical por linha (`overflow: hidden` + `translateY`), expansão de tracking, escala percussiva em palavras-chave e cortes secos sincronizados ao ritmo.",
    typographyGuide:
      "Bebas Neue, Oswald ou Bricolage Grotesque ExtraBold combinadas com Plus Jakarta Sans.",
    signatureMovements:
      "Entrada explosiva porém controlada de palavras-chave empurrando os termos anteriores com física de mola.",
    recommendedTransitions:
      "Inversão cromática de tela cheia (preto <-> branco/acento) ou deslizamento tipográfico em bloco.",
    depthAndLayers:
      "Plano tipográfico ultra-nítido sobre fundo sólido ou textura mínima para máxima legibilidade.",
    recommendedElements: [
      "Palavras-chave em escala heroica",
      "Barras de sublinhado dinâmico",
      "Molduras geométricas de ênfase",
    ],
    bestUseCases:
      "Manifestos, ganchos de retenção, frases de impacto, discursos curtos e anúncios dinâmicos.",
    technicalCautions:
      "Meça e limite a largura máxima das palavras em destaque para nunca cortar sílabas fora do quadro 1920x1080.",
    keywords: [
      "frase",
      "impacto",
      "manifesto",
      "texto",
      "palavras",
      "gancho",
      "atenção",
      "citação rápida",
    ],
  },
  {
    id: "google-search-simulation",
    index: 12,
    name: "Simulações de Pesquisa do Google",
    category: "social",
    categoryLabel: "Social e Viral",
    preferredTechnology: "html-css",
    visualCharacteristics:
      "Barra de busca minimalista e reconhecível, cursor de texto piscante determinístico, lista de sugestões de preenchimento automático (autocomplete) e cartões de resultados/notícias.",
    compositionTypes:
      "Barra centralizada que se eleva suavemente ao topo conforme o menu de sugestões ou os resultados da busca se abrem abaixo.",
    animationTechniques:
      "Digitação caractere por caractere determinística baseada em `t`, eventual apagamento/correção dramática de termo, movimento de seta do mouse em curva suave até a lupa/Enter e clique com ripple.",
    typographyGuide:
      "Plus Jakarta Sans limpa para a consulta digitada, negrito nos sufixos de sugestão e hierarquia clara de título/URL/snippet nos resultados.",
    signatureMovements:
      "Zoom progressivo na barra enquanto a pergunta intrigante é digitada, seguido pela transição rápida para o resultado revelador.",
    recommendedTransitions:
      "Elevação da barra de busca + fade/slide escalonado dos resultados ou zoom no link clicado.",
    depthAndLayers:
      "Fundo claro ou modo escuro autêntico de navegador, sombra suave de elevação na barra de pesquisa e cursor em primeiro plano.",
    recommendedElements: [
      "Campo de busca arredondado com ícone de lupa",
      "Cursor de texto (caret) e ponteiro do mouse",
      "Dropdown de autocomplete",
      "Cards de resultados ou manchetes",
    ],
    bestUseCases:
      "Aberturas investigativas, dúvidas frequentes do público, mistérios reais ('o que aconteceu com...'), SEO e documentários.",
    technicalCautions:
      "Calcule o índice de caracteres digitados puramente a partir de `(t - tStart) * charsPerSec` sem `setInterval`.",
    keywords: [
      "pesquisa",
      "google",
      "busca",
      "digitando",
      "procurar",
      "navegador",
      "pergunta",
      "o que é",
      "como",
    ],
  },
  {
    id: "social-engagement-mockups",
    index: 13,
    name: "Mockups de Engajamento e Redes Sociais",
    category: "social",
    categoryLabel: "Social e Viral",
    preferredTechnology: "html-css",
    visualCharacteristics:
      "Cartões estilizados de posts, threads, comentários, notificações empilhadas, contadores de curtidas/visualizações disparando e barras de áudio/mensagem.",
    compositionTypes:
      "Post principal ancorado ao centro com comentários/reações surgindo em cascata tridimensional ao redor ou em feed vertical enquadrado.",
    animationTechniques:
      "Entrada elástica (spring) de cards de notificação, contadores acelerados (`1.2K -> 48.9K -> 1.4M`), microanimação de coração/like com partículas sutis.",
    typographyGuide:
      "Plus Jakarta Sans para nome de perfil, handle e texto do post; JetBrains Mono/tabular-nums para métricas de engajamento.",
    signatureMovements:
      "Empilhamento rítmico de comentários/notificações com leve inclinação e foco na mensagem decisiva.",
    recommendedTransitions:
      "Scroll acelerado de feed desacelerando exatamente no post-alvo ou zoom em um comentário específico.",
    depthAndLayers:
      "Fundo com gradiente sutil, cartões com borda fina de 1px e sombra limpa, camada frontal de reações/destaques.",
    recommendedElements: [
      "Avatares geométricos/iniciais limpos",
      "Contadores de views, likes e reposts",
      "Bolhas de comentários e notificações",
      "Verificação e timestamps",
    ],
    bestUseCases:
      "Casos de repercussão na internet, polêmicas digitais, crescimento viral, histórias de fóruns/threads e marketing.",
    technicalCautions:
      "Use avatares vetoriais/geométricos limpos (nunca URLs externas quebradas) e mantenha texto do post perfeitamente legível.",
    keywords: [
      "rede social",
      "post",
      "comentário",
      "viral",
      "curtidas",
      "likes",
      "notificação",
      "thread",
      "mensagem",
      "chat",
    ],
  },
  {
    id: "advanced-kinetic-lyrics",
    index: 14,
    name: "Kinetic Typography Avançada / Lyric Videos",
    category: "social",
    categoryLabel: "Social e Viral",
    preferredTechnology: "hybrid",
    visualCharacteristics:
      "Coreografia espacial de palavras em câmera virtual 2D: rotações de 90 graus entre versos, palavras preenchendo molduras, texto contornado (`stroke`) vs preenchido e trilhas tipográficas.",
    compositionTypes:
      "Construção tipográfica progressiva onde cada palavra encaixa geometricamente na anterior formando um bloco escultural antes da câmera girar para a próxima estrofe.",
    animationTechniques:
      "Câmera virtual acompanhando a palavra ativa (pan + rotação + zoom coordenados), revelação por máscara diagonal e deformação elástica controlada.",
    typographyGuide:
      "Combinação expressiva de Bebas Neue / Oswald com serifada editorial (Playfair Display / Cinzel) para contraste poético.",
    signatureMovements:
      "Giro de câmera de 90° ou zoom contínuo conectando o final de uma frase ao início da próxima.",
    recommendedTransitions:
      "Transição contínua de câmera espacial sem cortes bruscos entre versos da mesma seção.",
    depthAndLayers:
      "Atmosfera de fundo reativa ao tom emocional, plano tipográfico principal e partículas/linhas rítmicas discretas.",
    recommendedElements: [
      "Tipografia sólida e contornada (outline)",
      "Linhas divisórias sincronizadas",
      " Destaques cromáticos na sílaba/palavra tônica",
    ],
    bestUseCases:
      "Lyric videos, poesias narradas, narrações dramáticas intensas, trailers tipográficos e monólogos.",
    technicalCautions:
      "Garanta que no instante de leitura cada palavra ativa esteja horizontalmente legível no centro óptico da câmera.",
    keywords: [
      "música",
      "letra",
      "lyric",
      "poesia",
      "monólogo",
      "narração",
      "ritmo",
      "verso",
    ],
  },
  {
    id: "liquid-gradient-blob",
    index: 15,
    name: "Liquid Motion / Gradient & Blob Animations",
    category: "social",
    categoryLabel: "Social e Viral",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Formas fluidas orgânicas (metaballs / curvas trigonométricas suaves), gradientes mesh vibrantes ou etéreos, transições viscosas e refração luminosa suave.",
    compositionTypes:
      "Composição orgânica fluida emoldurando tipografia limpa de alto contraste no centro ou terço áureo.",
    animationTechniques:
      "Deformação harmônica de contornos fechados por soma de senos/cossenos de `t`, fusão suave de bolhas cromáticas e deslocamento lento de gradientes radiais.",
    typographyGuide:
      "Outfit ou Plus Jakarta Sans limpa e espaçada sobreposta com contraste impecável.",
    signatureMovements:
      "Expansão líquida que envolve a tela para revelar novo estado ou título.",
    recommendedTransitions:
      "Liquid wipe orgânico atravessando o quadro de uma margem à outra.",
    depthAndLayers:
      "Base escura ou clara suave, 2 a 3 camadas fluidas com blend modes (`screen` ou `lighter` controlado) e camada tipográfica nítida.",
    recommendedElements: [
      "Formas orgânicas animadas por harmônicos",
      "Gradientes radiais multicor",
      "Anéis fluidos sutis",
    ],
    bestUseCases:
      "Temas criativos, bem-estar, música eletrônica/ambient, inovação estética, moda e aberturas modernas.",
    technicalCautions:
      "Evite filtros `blur()` excessivamente caros em alta resolução a cada frame; prefira gradientes radiais suaves nativos do Canvas.",
    keywords: [
      "líquido",
      "fluido",
      "orgânico",
      "gradiente",
      "abstrato moderno",
      "energia",
      "ondas",
    ],
  },
  {
    id: "glitch-datamosh-vhs",
    index: 16,
    name: "Glitch / Datamosh / VHS",
    category: "social",
    categoryLabel: "Social e Viral",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Estética analógica/digital corrompida intencional: separação de canais RGB (aberração cromática), scanlines horizontais, deslocamento de fatias (slice offset), timecode VHS e ruído determinístico.",
    compositionTypes:
      "Enquadramento de gravação de arquivo/fita de segurança ou terminal interceptado, com metadados REC/TIMECODE nos cantos seguros e assunto central.",
    animationTechniques:
      "Rajadas curtas e precisas de deslocamento horizontal de fatias (`drawImage` / `clip`) apenas em momentos de tensão ou transição, mantendo janelas limpas de leitura entre os pulsos de glitch.",
    typographyGuide:
      "JetBrains Mono para metadados de fita/arquivo e Oswald/Bebas Neue para títulos incisivos.",
    signatureMovements:
      "Estabilização súbita após um pulso de interferência RGB sincronizado com revelação de evidência ou mudança de cena.",
    recommendedTransitions:
      "Tracking error analógico / corrupção de blocos por 0.25s conectando duas cenas.",
    depthAndLayers:
      "Cena base, camada de deslocamento RGB em janelas de impacto, malha leve de scanlines e HUD de gravação.",
    recommendedElements: [
      "Separação cromática Ciano/Magenta/Vermelho",
      "Scanlines sutis",
      "Moldura de arquivo / VHS timecode",
      "Blocos de interferência determinística",
    ],
    bestUseCases:
      "True crime, terror digital, mistérios não resolvidos, hackers, conspirações, arquivos secretos e ficção sombria.",
    technicalCautions:
      "O glitch deve ser PONTUAL e INTENCIONAL — nunca embaralhe o texto durante todo o tempo de leitura.",
    keywords: [
      "glitch",
      "vhs",
      "arquivo",
      "fita",
      "erro",
      "hacker",
      "crime",
      "sombrio",
      "interferência",
      "segurança",
      "terror",
    ],
  },

  // =========================================================================
  // BRANDING E IDENTIDADE (17 - 20)
  // =========================================================================
  {
    id: "animated-logos-branding",
    index: 17,
    name: "Animated Logos & Branding",
    category: "branding",
    categoryLabel: "Branding e Identidade",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Construção geométrica refinada de marca/emblema, linhas de construção áurea sutis que convergem para o símbolo final, brilho especular elegante e assinatura tipográfica.",
    compositionTypes:
      "Centralização nobre com amplo respiro ao redor (mínimo 35% de margem livre) e alinhamento óptico impecável entre símbolo e wordmark.",
    animationTechniques:
      "Traçado construtivo de arcos e hastes convergindo com easing exponencial suave, reveal de wordmark com tracking decrescente e passagem única de luz (sheen).",
    typographyGuide:
      "Tipografia institucional de alto padrão (Outfit, Cinzel ou Oswald com tracking refinado).",
    signatureMovements:
      "Convergência harmônica de elementos geométricos formando o emblema seguida de estabilização majestosa.",
    recommendedTransitions:
      "Fade luminoso sutil ou abertura íris geométrica.",
    depthAndLayers:
      "Fundo atmosférico rico, linhas sutis de construção que se dissipam, emblema principal e reflexo de luz controlado.",
    recommendedElements: [
      "Monograma ou emblema vetorial",
      "Guias geométricas de construção",
      "Wordmark e tagline alinhados",
    ],
    bestUseCases:
      "Apresentação de marca, encerramento institucional, identidade de canal e lançamento de produto.",
    technicalCautions:
      "Evite excesso de partículas; a elegância vem da precisão das curvas de velocidade (ease-out longo).",
    keywords: [
      "marca",
      "logo",
      "logotipo",
      "identidade",
      "branding",
      "assinatura",
      "institucional",
    ],
  },
  {
    id: "typography-3d-extruded",
    index: 18,
    name: "Typography 3D & Extruded Text",
    category: "branding",
    categoryLabel: "Branding e Identidade",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Tipografia monumental com extrusão volumétrica em camadas (long shadow / múltiplas fatias deslocadas com gradiente de profundidade), chanfro luminoso e presença escultural.",
    compositionTypes:
      "Título escultural centralizado ocupando o eixo principal com iluminação direcional simulada nas faces extrudadas.",
    animationTechniques:
      "Crescimento progressivo do vetor de extrusão conforme a luz virtual se move, entrada por mola pesada (baixa frequência, alto impacto) e leve paralaxe de perspectiva.",
    typographyGuide:
      "Bebas Neue, Oswald Bold ou Anton/Archivo Black em tamanho expressivo.",
    signatureMovements:
      "Elevação do bloco tipográfico a partir do plano de fundo projetando profundidade tridimensional nítida.",
    recommendedTransitions:
      "Compressão da extrusão de volta ao plano 2D seguida de corte dinâmico.",
    depthAndLayers:
      "Fundo contrastante, sombra projetada suave, camadas de extrusão lateral sombreadas e face frontal ultra-legível.",
    recommendedElements: [
      "Letras com volume extrudado determinístico",
      "Iluminação lateral nas faces",
      "Subtítulo plano de contraste",
    ],
    bestUseCases:
      "Títulos de episódios, capas animadas, aberturas épicas, anúncios de eventos e capítulos.",
    technicalCautions:
      "Use 12 a 20 passos de extrusão em loop enxuto para manter performance de 60 FPS e leitura cristalina na face frontal.",
    keywords: [
      "3d",
      "título",
      "épico",
      "capítulo",
      "abertura",
      "monumental",
      "extrudado",
      "volume",
    ],
  },
  {
    id: "kinetic-logo-stings",
    index: 19,
    name: "Kinetic Logo Stings / Bumpers",
    category: "branding",
    categoryLabel: "Branding e Identidade",
    preferredTechnology: "hybrid",
    visualCharacteristics:
      "Vinheta curta (3s a 6s), energética e cirúrgica: impacto rítmico rápido, cortes geométricos velozes convergindo para a assinatura final.",
    compositionTypes:
      "Convergência centrípeta de formas rápidas rumo ao ponto focal central (960, 540).",
    animationTechniques:
      "Aceleração forte (ease-in) no impacto inicial seguida de desaceleração longa (ease-out quintic) na revelação da marca/título.",
    typographyGuide:
      "Display condensada ou geométrica arrojada com tagline minimalista.",
    signatureMovements:
      "Choque ou cruzamento veloz de feixes/formas que destrava o título ou símbolo em menos de 2 segundos, mantendo estabilização limpa até o fim.",
    recommendedTransitions:
      "Flash geométrico de 3 frames ou wipe diagonal rápido.",
    depthAndLayers:
      "Fundo limpo, feixes de velocidade vetoriais e plano principal da assinatura.",
    recommendedElements: [
      "Traços de velocidade precisos",
      "Emblema/nome do canal",
      "Moldura de impacto",
    ],
    bestUseCases:
      "Vinhetas de abertura, bumpers de transição entre blocos de vídeo e assinaturas rápidas.",
    technicalCautions:
      "Reserve pelo menos 40% da duração final para leitura estática/respirando da marca após o impacto.",
    keywords: [
      "vinheta",
      "bumper",
      "sting",
      "intro curta",
      "assinatura rápida",
      "canal",
    ],
  },
  {
    id: "morphing-shape-transitions",
    index: 20,
    name: "Morphing & Shape Transitions",
    category: "branding",
    categoryLabel: "Branding e Identidade",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Metamorfose contínua de formas geométricas puras (círculo -> triângulo -> quadrado -> estrela/símbolo) onde cada cena nasce fisicamente da geometria da cena anterior.",
    compositionTypes:
      "Geometria central dominante equilibrada por tipografia concisa integrada ao movimento da forma.",
    animationTechniques:
      "Interpolação paramétrica de vértices poligonais/curvas em função de `prog`, rotação contínua sincronizada à metamorfose e inversão figura-fundo.",
    typographyGuide:
      "Plus Jakarta Sans ou Outfit acompanhando a precisão matemática das formas.",
    signatureMovements:
      "Uma forma expande para preencher a tela (tornando-se o novo fundo) enquanto do seu centro emerge a próxima forma.",
    recommendedTransitions:
      "Inversão figura-fundo contínua (zero cortes secos).",
    depthAndLayers:
      "Jogo gráfico puro de planos positivos e negativos com bordas nítidas.",
    recommendedElements: [
      "Polígonos interpolados",
      "Arcos concêntricos",
      "Máscaras geométricas expansivas",
    ],
    bestUseCases:
      "Narrativas conceituais, evolução de ideias, design editorial abstrato e vídeos de transformação.",
    technicalCautions:
      "Parametrize todas as formas com o mesmo número de amostras/vértices para interpolação suave sem artefatos.",
    keywords: [
      "transformação",
      "metamorfose",
      "evolução",
      "formas",
      "geométrico",
      "mudança",
      "transição contínua",
    ],
  },

  // =========================================================================
  // PRODUTO, INTERFACE E TECNOLOGIA (21 - 24)
  // =========================================================================
  {
    id: "ui-lottie-animations",
    index: 21,
    name: "UI & Lottie Animations",
    category: "product",
    categoryLabel: "Produto, Interface e Tecnologia",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Microinterações vetoriais ultra-polidas: toggles suaves, checkmarks de confirmação, cards interativos, barras de progresso inteligentes e estados vazios/concluídos elegantes.",
    compositionTypes:
      "Componente de interface ampliado em destaque central com foco nos detalhes táteis da interação.",
    animationTechniques:
      "Física de mola calibrada, morphing de ícone de estado (ex: botão -> spinner -> check verde), ripple de toque e elevação sutil de sombra.",
    typographyGuide:
      "Plus Jakarta Sans com pesos Regular e SemiBold; alinhamento perfeito de pixels.",
    signatureMovements:
      "Clique intencional seguido por resposta elástica imediata do componente e confirmação visual satisfatória.",
    recommendedTransitions:
      "Expansão de card (shared-element transition) ou slide suave de estado.",
    depthAndLayers:
      "Plano de fundo suave, container de componente elevado com borda de 1px e elementos internos em camadas.",
    recommendedElements: [
      "Botões e switches interativos",
      "Ícones animados de confirmação/alerta",
      "Indicadores de status limpos",
      "Ponteiro de interação sutil",
    ],
    bestUseCases:
      "Demonstração de funcionalidades de software, onboarding, UX/UI showcases e fluxos de aplicativos.",
    technicalCautions:
      "Mantenha durações de microinteração ágeis (0.25s a 0.5s) seguidas de pausa clara para leitura do novo estado.",
    keywords: [
      "interface",
      "botão",
      "clique",
      "aplicativo",
      "ux",
      "ui",
      "confirmação",
      "funcionalidade",
    ],
  },
  {
    id: "isometric-flat-design",
    index: 22,
    name: "Isometric & Flat Design",
    category: "product",
    categoryLabel: "Produto, Interface e Tecnologia",
    preferredTechnology: "svg",
    visualCharacteristics:
      "Projeção isométrica matemática (ângulos de 30° / razão `cos(30°), sin(30°)`), blocos arquitetônicos limpos, servidores, plataformas flutuantes e iluminação de 3 faces (topo claro, esquerda média, direita escura).",
    compositionTypes:
      "Diorama isométrico centralizado com plataformas conectadas por trilhas de dados e legendas flutuantes alinhadas.",
    animationTechniques:
      "Levitacão senoidal defasada das plataformas, montagem vertical (drop-in com mola) dos blocos isométricos e pulsos percorrendo os trilhos em 30°.",
    typographyGuide:
      "Plus Jakarta Sans para rótulos de módulos e JetBrains Mono para métricas técnicas.",
    signatureMovements:
      "Construção ordenada da ilha isométrica de baixo para cima seguida de fluxo ativo entre os módulos.",
    recommendedTransitions:
      "Deslizamento pan na diagonal isométrica (30°) revelando a próxima plataforma.",
    depthAndLayers:
      "Malha isométrica sutil ao fundo, sombras projetadas na base, blocos volumétricos de 3 faces e rótulos superiores.",
    recommendedElements: [
      "Cubos e plataformas isométricas de 3 tons",
      "Trilhas luminosas em ângulo de 30°",
      "Ícones técnicos sobre os módulos",
    ],
    bestUseCases:
      "Infraestrutura em nuvem, ecossistemas digitais, logística, fintechs, engenharia e tecnologia B2B.",
    technicalCautions:
      "Ordene o desenho dos blocos de trás para a frente (`x + y` crescente) para oclusão isométrica perfeita.",
    keywords: [
      "isométrico",
      "nuvem",
      "servidor",
      "ecossistema",
      "plataforma",
      "infraestrutura",
      "módulos",
      "tecnologia",
    ],
  },
  {
    id: "product-device-mockups",
    index: 23,
    name: "Product & Device Mockups",
    category: "product",
    categoryLabel: "Produto, Interface e Tecnologia",
    preferredTechnology: "html-css",
    visualCharacteristics:
      "Molduras minimalistas e elegantes de navegador desktop, smartphone ou tablet exibindo telas vivas de produto ao lado de chamadas de valor (value propositions).",
    compositionTypes:
      "Split-screen equilibrado (texto à esquerda + dispositivo vivo à direita) ou dispositivo centralizado com zoom na área de destaque.",
    animationTechniques:
      "Entrada flutuante do dispositivo com perspectiva sutil, scroll interno controlado da tela demonstrada e callouts destacados em zoom.",
    typographyGuide:
      "Outfit / Plus Jakarta Sans Bold para headlines de produto e tipografia nítida de interface dentro da tela do dispositivo.",
    signatureMovements:
      "Inclinação suave do mockup acompanhada de destaque em lupa/zoom sobre a funcionalidade chave mencionada no roteiro.",
    recommendedTransitions:
      "Transição de dispositivo (desktop -> mobile) ou deslize lateral da tela interna.",
    depthAndLayers:
      "Fundo studio sofisticado, halo de luz suave atrás do chassi do dispositivo, tela interna com `overflow: hidden` e badges de destaque.",
    recommendedElements: [
      "Janela de navegador ou chassi de smartphone minimalista",
      "Interface viva navegável por seek(t)",
      "Callouts explicativos externos",
    ],
    bestUseCases:
      "Lançamentos de SaaS, demonstrações de sites/apps, apresentações de portfólio e vídeos promocionais.",
    technicalCautions:
      "Garanta que todo conteúdo dentro da tela simulada escale proporcionalmente sem barras de rolagem nativas indesejadas.",
    keywords: [
      "produto",
      "celular",
      "smartphone",
      "tela",
      "site",
      "dashboard",
      "lançamento",
      "saas",
      "app",
    ],
  },
  {
    id: "hud-scifi-interface",
    index: 24,
    name: "HUD & Sci-Fi Interface",
    category: "product",
    categoryLabel: "Produto, Interface e Tecnologia",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Interfaces táticas futuristas (FUI): retículas concêntricas de precisão, cantoneiras técnicas, escaneamento biométrico/forense abstrato, grades em perspectiva e telemetria monoespaçada.",
    compositionTypes:
      "Visor tático simétrico ou assimétrico balanceado com retícula central e painéis laterais de diagnóstico contidos na área segura.",
    animationTechniques:
      "Arcos parciais girando em velocidades harmônicas opostas, linhas de scan varrendo o alvo, travamento de mira (lock-on) com mola rápida e revelação monoespaçada.",
    typographyGuide:
      "Oswald para cabeçalhos táticos e JetBrains Mono para coordenadas, códigos e leituras.",
    signatureMovements:
      "Convergência e travamento (lock-on) de anéis concêntricos sobre a informação principal do roteiro.",
    recommendedTransitions:
      "Fechamento/abertura de obturador tático ou varredura laser horizontal.",
    depthAndLayers:
      "Fundo escuro profundo, grade tática tênue, anéis/vetores luminosos em modo `screen` e camada de dados prioritários.",
    recommendedElements: [
      "Anéis de radar e arcos segmentados",
      "Cantoneiras de enquadramento (brackets)",
      "Barras de espectro/sinal",
      "Painéis translúcidos de telemetria",
    ],
    bestUseCases:
      "Investigações forenses, dossiês confidenciais, cibersegurança, ficção científica, defesa e análises técnicas.",
    technicalCautions:
      "Evite poluição visual que compita com o título principal; o centro óptico deve permanecer limpo para a mensagem do roteiro.",
    keywords: [
      "hud",
      "forense",
      "dossiê",
      "confidencial",
      "radar",
      "tático",
      "futurista",
      "investigação",
      "scanner",
      "cibernético",
    ],
  },

  // =========================================================================
  // EDIÇÃO E TRANSIÇÕES (25 - 28)
  // =========================================================================
  {
    id: "transitions-effects",
    index: 25,
    name: "Transições e Efeitos",
    category: "editing",
    categoryLabel: "Edição e Transições",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Dinamismo cinematográfico de montagem: match-cuts geométricos, whip pans com motion blur direcional simulado, wipes em fatias diagonais e revelações por máscara.",
    compositionTypes:
      "Quadros de forte impacto gráfico projetados especificamente para conectar o centro de interesse da Cena N ao centro de interesse da Cena N+1.",
    animationTechniques:
      "Continuidade de velocidade máxima no ponto exato do corte (speed graph peak at cut), máscaras poligonais expansivas e rastros direcionais.",
    typographyGuide:
      "Bebas Neue ou Oswald integrada diretamente às máscaras de passagem.",
    signatureMovements:
      "Aceleração exponencial até o corte e desaceleração fluida na chegada da cena seguinte (match de direção e escala).",
    recommendedTransitions:
      "Geometric mask wipe, whip-pan simulado e zoom-through através de caracteres ou formas.",
    depthAndLayers:
      "Cena saliente, máscara de transição intermediária em alto contraste e cena entrante.",
    recommendedElements: [
      "Cortinas geométricas inclinadas",
      " Formas-ponte de match-cut",
      "Rastros de movimento direcionais",
    ],
    bestUseCases:
      "Montagens rítmicas aceleradas, teasers, trailers, compilações dinâmicas e passagens de capítulo.",
    technicalCautions:
      "Toda transição rápida deve ser seguida por tempo suficiente de estabilização para absorção do conteúdo.",
    keywords: [
      "transição",
      "trailer",
      "teaser",
      "dinâmico",
      "rápido",
      "montagem",
      "corte",
    ],
  },
  {
    id: "lower-thirds-broadcast",
    index: 26,
    name: "Lower Thirds e Broadcast Graphics",
    category: "editing",
    categoryLabel: "Edição e Transições",
    preferredTechnology: "html-css",
    visualCharacteristics:
      "Pacote gráfico televisivo/documental refinado: tarjas de identificação (lower thirds), cartelas de capítulo, tickers informativos limpos, selos de localização/data e quadros de citação.",
    compositionTypes:
      "Ancoragem precisa no terço inferior seguro (`X: 200..1200, Y: 720..880`) ou cartelas broadcast estruturadas respeitando margens de transmissão.",
    animationTechniques:
      "Abertura da barra guia vertical/horizontal seguida de deslize mascarado do nome principal e subtítulo com atraso elegante de 0.12s, e recolhimento reverso limpo.",
    typographyGuide:
      "Oswald / Plus Jakarta Sans Bold para nome/manchete e peso Regular/Mono para cargo, local e data.",
    signatureMovements:
      "Linha de acento se desenha primeiro e 'abre' como máscara para as duas linhas de identificação broadcast.",
    recommendedTransitions:
      "Recolhimento simétrico dentro da barra guia ou stinger broadcast limpio.",
    depthAndLayers:
      "Plano de fundo temático sutil ou escuro/transparente, barra estrutural com blur/contraste e tipografia nítida.",
    recommendedElements: [
      "Tarjas de nome e função (Lower Thirds)",
      "Marcadores de local e data (ex: SÃO PAULO · 1998)",
      "Cartelas de manchete jornalística",
    ],
    bestUseCases:
      "Documentários, jornalismo, entrevistas, identificação de especialistas/locais e vídeos informativos.",
    technicalCautions:
      "Dimensione a largura da tarja dinamicamente ao texto exibido para nunca truncar nomes ou sobrar caixa vazia.",
    keywords: [
      "documentário",
      "jornalismo",
      "entrevista",
      "tarja",
      "lower third",
      "manchete",
      "notícia",
      "data e local",
    ],
  },
  {
    id: "particle-vfx-motion",
    index: 27,
    name: "Particle & VFX Motion",
    category: "editing",
    categoryLabel: "Edição e Transições",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Atmosfera cinematográfica rica: partículas determinísticas em profundidade (brasas, poeira em feixe de luz, constelações neurais), raios volumétricos (God Rays) e halos sutis.",
    compositionTypes:
      "Iluminação dramática central ou diagonal com tipografia/símbolo emergindo da atmosfera volumétrica.",
    animationTechniques:
      "Campo vetorial determinístico (senóides acopladas por semente fixa) conduzindo até 45 partículas em múltiplos tamanhos/opacidades (bokeh próximo vs poeira distante) com composição `'screen'`.",
    typographyGuide:
      "Cinzel, Bebas Neue ou Oswald com espaçamento elegante e alto contraste sobre a névoa luminosa.",
    signatureMovements:
      "Deriva hipnótica de partículas e feixes de luz reagindo sutilmente a momentos de revelação do roteiro.",
    recommendedTransitions:
      "Dissolução em partículas/luz ou passagem de nuvem/névoa atmosférica.",
    depthAndLayers:
      "Fundo profundo, feixes volumétricos em gradiente linear/radial, partículas de fundo, elemento/título central nítido e partículas esparsas em primeiro plano.",
    recommendedElements: [
      "Feixes de luz volumétrica (God Rays)",
      "Partículas com paralaxe de profundidade",
      "Ondas de choque luminosas sutis",
    ],
    bestUseCases:
      "Cenas épicas, suspense cinematográfico, espiritualidade, ciência cósmica e narrativas densas estilo MALA.SOMBRE.",
    technicalCautions:
      "Mantenha os feixes e partículas ao redor/atrás do texto principal para nunca reduzir a legibilidade.",
    keywords: [
      "partículas",
      "luz",
      "névoa",
      "atmosfera",
      "suspense",
      "cinematográfico",
      "cosmos",
      "poeira",
      "energia",
    ],
  },
  {
    id: "looping-backgrounds-textures",
    index: 28,
    name: "Looping Backgrounds & Motion Textures",
    category: "editing",
    categoryLabel: "Edição e Transições",
    preferredTechnology: "canvas2d",
    visualCharacteristics:
      "Padrões geométricos hipnóticos, linhas topográficas animadas, grades ondulantes, aurora sutil ou texturas cinéticas com continuidade cíclica perfeita (`f(0) === f(DURATION)`).",
    compositionTypes:
      "Campo visual contínuo harmonioso que sustenta títulos minimalistas ou funciona como pano de fundo de alta classe.",
    animationTechniques:
      "Funções periódicas fechadas usando `phase = (t / DURATION) * Math.PI * 2` garantindo que o último frame coincida matematicamente com o primeiro.",
    typographyGuide:
      "Tipografia limpa e serena centralizada caso o roteiro inclua texto sobre o loop.",
    signatureMovements:
      "Fluxo contínuo, rítmico e sem costuras temporais (seamless loop).",
    recommendedTransitions:
      "Evolução harmônica contínua sem cortes bruscos.",
    depthAndLayers:
      "Gradiente base, linhas de campo/topografia moduladas por fase periódica e acentos sutis de brilho.",
    recommendedElements: [
      "Curvas topográficas isolinhas",
      "Padrões geométricos em fase",
      "Ondas harmônicas contínuas",
    ],
    bestUseCases:
      "Fundos animados em loop, telas de espera elegantes, capítulos contemplativos e cenários abstratos.",
    technicalCautions:
      "Use exclusivamente múltiplos inteiros de `2 * Math.PI * (t / DURATION)` nas fases para garantir loop perfeito.",
    keywords: [
      "loop",
      "fundo animado",
      "textura",
      "contínuo",
      "topográfico",
      "padrão",
      "background",
    ],
  },

  // =========================================================================
  // EXPERIMENTAL E EDITORIAL (29 - 30)
  // =========================================================================
  {
    id: "motion-collage-stopmotion",
    index: 29,
    name: "Motion Collage / Stop Motion Digital",
    category: "experimental",
    categoryLabel: "Experimental e Editorial",
    preferredTechnology: "hybrid",
    visualCharacteristics:
      "Estética editorial de colagem mista: recortes angulares tipo papel rasgado, fitas adesivas gráficas, meios-tons (halftone/pontilhado), tipografia tipo recorte de jornal/revista e cadência stepped.",
    compositionTypes:
      "Composição assimétrica autoral estilo zine/revista de arte com sobreposições planejadas e forte contraste cromático (ex: creme, preto tinta, carmim ou violeta).",
    animationTechniques:
      "Quantização temporal intencional (`const steppedT = Math.floor(t * 12) / 12;` simulando 12 fps de stop-motion artesanal) nos elementos de colagem, combinada com rotações discretas e desdobramento de recortes.",
    typographyGuide:
      "Mistura intencional de serifada editorial (Playfair Display / Fraunces) com blocos de caixa alta condensada (Oswald) em tarjas recortadas.",
    signatureMovements:
      "Desdobramento em etapas ('unfold') de recortes de papel e entrada de tarjas de texto como colagens físicas.",
    recommendedTransitions:
      "Cobertura rápida da tela por folhas/tiras de colagem que são retiradas na cena seguinte.",
    depthAndLayers:
      "Base texturizada editorial, recortes gráficos com sombra curta e dura, elementos de destaque e tarjas de texto.",
    recommendedElements: [
      "Molduras de recorte poligonal estilo papel",
      "Padrões de pontos halftone",
      "Tarjas tipográficas inclinadas",
      "Setas e marcações editoriais",
    ],
    bestUseCases:
      "Ensaios culturais, história, biografias, crônicas investigativas, arte, música e jornalismo literário.",
    technicalCautions:
      "A quantização stepped (`12 fps`) deve ser determinística em função de `t`, nunca aleatória.",
    keywords: [
      "colagem",
      "stop motion",
      "editorial",
      "jornal",
      "revista",
      "história",
      "ensaio",
      "recorte",
      "biografia",
    ],
  },
  {
    id: "social-proof-testimonial",
    index: 30,
    name: "Social Proof & Testimonial Motion",
    category: "experimental",
    categoryLabel: "Experimental e Editorial",
    preferredTechnology: "html-css",
    visualCharacteristics:
      "Destaque editorial elegante para citações, depoimentos, avaliações 5 estrelas, selos de conquista e trechos grifados com marca-texto animado.",
    compositionTypes:
      "Aspas esculturais discretas emoldurando a citação centralizada, com atribuição de autor/fonte limpa na base e estrelas/métricas acima.",
    animationTechniques:
      "Revelação suave da citação acompanhada de grifo progressivo (`background-size` / retângulo colorido atrás das palavras-chave), preenchimento sequencial de estrelas com mola e carrossel suave entre depoimentos.",
    typographyGuide:
      "Fraunces, Lora ou Playfair Display para o corpo da citação humana; Plus Jakarta Sans para autor, cargo e métricas.",
    signatureMovements:
      "Passagem fluida do marca-texto iluminando o trecho mais forte da citação exatamente no clímax de leitura.",
    recommendedTransitions:
      "Deslizamento horizontal suave com escala em profundidade entre cartões de citação.",
    depthAndLayers:
      "Fundo calmo e sofisticado, cartão editorial de citação com borda sutil e camada de grifo/estrelas.",
    recommendedElements: [
      "Aspas tipográficas elegantes",
      "Grifo progressivo nas palavras-chave",
      "Estrelas de avaliação animadas",
      "Assinatura de autor e contexto",
    ],
    bestUseCases:
      "Depoimentos de clientes, citações históricas ou literárias, provas sociais, reviews e estudos de caso.",
    technicalCautions:
      "Preserve literalmente o texto da citação/depoimento fornecido no roteiro sem adulterar palavras.",
    keywords: [
      "depoimento",
      "citação",
      "avaliação",
      "estrelas",
      "cliente",
      "disse",
      "relato",
      "testemunho",
      "prova social",
    ],
  },
];

export const STYLE_MAP_BY_ID: Record<StyleId, MotionStyleSpec> =
  MOTION_STYLE_LIBRARY.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {} as Record<StyleId, MotionStyleSpec>);

export function isValidStyleId(value: unknown): value is StyleId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STYLE_MAP_BY_ID, value);
}

export function getStyleById(id: StyleId): MotionStyleSpec {
  return STYLE_MAP_BY_ID[id] ?? MOTION_STYLE_LIBRARY[0];
}

export function getCategoryRules(category: StyleCategory): string {
  const found = STYLE_CATEGORIES.find((c) => c.id === category);
  return found ? found.specializationRules : "";
}

/**
 * Sugere os estilos mais aderentes semanticamente ao roteiro como apoio ao Diretor Criativo de IA.
 */
export function recommendStylesForScript(script: string, limit: number = 4): MotionStyleSpec[] {
  const lower = script.toLowerCase();
  const scored = MOTION_STYLE_LIBRARY.map((style) => {
    let score = 0;
    for (const kw of style.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += kw.includes(" ") ? 3 : 2;
      }
    }
    // Heurísticas estruturais complementares
    if (/%|\b\d+\s*(mil|milhões|bilhões|x|vezes)\b/i.test(script)) {
      if (style.category === "data") score += 2.5;
    }
    if (/["“”«»]/.test(script) && style.id === "social-proof-testimonial") {
      score += 2;
    }
    if (/\b(19\d\d|20\d\d)\b/.test(script) && (style.id === "lower-thirds-broadcast" || style.id === "motion-collage-stopmotion")) {
      score += 1.5;
    }
    if (/\b(névoa|sombra|escuro|noite|silêncio|mistério|desapareceu|crime)\b/i.test(script)) {
      if (
        style.id === "paper-cutout-parallax" ||
        style.id === "particle-vfx-motion" ||
        style.id === "hud-scifi-interface" ||
        style.id === "glitch-datamosh-vhs"
      ) {
        score += 2.5;
      }
    }
    return { style, score };
  });

  scored.sort((a, b) => b.score - a.score || a.style.index - b.style.index);

  const nonZero = scored.filter((item) => item.score > 0).map((item) => item.style);
  if (nonZero.length >= limit) {
    return nonZero.slice(0, limit);
  }

  // Complementa com estilos versáteis caso o roteiro seja aberto/abstrato
  const defaults: StyleId[] = [
    "explainer-videos",
    "kinetic-text",
    "particle-vfx-motion",
    "animated-infographics",
  ];
  const result = [...nonZero];
  for (const defId of defaults) {
    if (result.length >= limit) break;
    if (!result.some((s) => s.id === defId)) {
      result.push(getStyleById(defId));
    }
  }
  return result;
}

/**
 * Formata um guia compacto do catálogo completo de 30 estilos + ficha profunda dos estilos selecionados.
 */
export function formatStyleCatalogOverview(): string {
  return MOTION_STYLE_LIBRARY.map(
    (s) => `${s.index}. [${s.id}] ${s.name} (${s.categoryLabel} · pref: ${s.preferredTechnology})`
  ).join("\n");
}

export function formatDetailedStyleSpecs(styleIds: StyleId[]): string {
  const uniqueIds = Array.from(new Set(styleIds));
  return uniqueIds
    .map((id) => {
      const s = getStyleById(id);
      const catRule = getCategoryRules(s.category);
      return `### ESTILO ESPECIALIZADO: ${s.name} (ID: ${s.id} | Categoria: ${s.categoryLabel})
- Tecnologia Preferencial: ${s.preferredTechnology}
- Regra da Categoria: ${catRule}
- Características Visuais: ${s.visualCharacteristics}
- Composição: ${s.compositionTypes}
- Técnicas de Animação: ${s.animationTechniques}
- Tipografia Recomendada: ${s.typographyGuide}
- Movimentos Característicos: ${s.signatureMovements}
- Transições Recomendadas: ${s.recommendedTransitions}
- Profundidade e Camadas: ${s.depthAndLayers}
- Elementos Visuais Recomendados: ${s.recommendedElements.join(", ")}
- Cuidados Técnicos: ${s.technicalCautions}`;
    })
    .join("\n\n");
}
