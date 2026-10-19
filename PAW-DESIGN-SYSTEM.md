# Design system — PAW Nailo / Poke Ascended World (Prisma Theme)

> Contrato vigente: [Regras de composição do launcher](docs/LAUNCHER-VISUAL-RULES.md). O launcher adota a identidade oficial do cliente de jogo Poke Ascended World (Prisma HUD), eliminando temas obsoletos de terceiros e cutouts para oferecer máxima área útil e imersão nativa.

## Princípio

O launcher é um companion de jogo oficial para operar até quatro contas com a mesma estética do HUD do Poke Ascended World. A interface utiliza estética cyber-navy, molduras chanfradas metálicas, acentos ciano neon (`#81e4f8`) e cantos em corte vetorial (`corner.svg` e `crystal.svg`).

## Camadas e cascata

1. `index.html`: casca operacional e webviews das contas.
2. `pokeleaf-shell.css`: base do layout estrutural.
3. `paw-game-theme.css`: tema vigente oficial, espelhando fielmente os tokens e componentes do HUD oficial do jogo (`identity.css` e `hud.css`).
4. `panel-controls.css` & `battle-hud.css`: controles adicionais e métricas.

## Tokens vigentes

| Papel | Token | Valor |
| --- | --- | --- |
| Fundo | `--color-bg-base` | `#081224` |
| Fundo elevado | `--color-bg-elevated` | `#0b1930` |
| Superfícies | `--color-surface-1/2` | `#13253d` / `#1c3150` |
| Hover | `--color-surface-hover` | `#294565` |
| Texto | `--color-text-primary/secondary/muted` | `#f3f6fc` / `#c5d5ea` / `#a6bbd5` |
| Acento frio | `--color-accent` | `#9fc3ef` |
| Ação principal | `--color-action-primary` | `#3b8659` |
| Estados | `--color-success/warning/danger` | `#91ddaa` / `#e9c889` / `#ed939b` |
| Bordas | `--border-subtle/strong` | `#405a7d` / `#7899c0` |
| Raios | `--radius-xs/sm/md/lg` | 5 / 8 / 11 / 14 px |
| Espaço | `--space-1/2/3/4` | 4 / 8 / 12 / 16 px |
| Motion | `--motion-fast/normal/slow` | 120 / 190 / 260 ms |
| Sombra | `--shadow-small/medium/overlay` | cartões / painéis / popovers |

O verde indica ações de equipe e jogo; o azul prateado organiza controles do shell. Cor nunca deve ser o único indicador de online, atenção ou erro: rótulo acompanha o estado.

## Tipografia e densidade

- Marca e títulos de telas: Georgia, como no tema atual. Texto operacional: Segoe UI Variable/Segoe UI, preservando a renderização nativa do Windows.
- Números operacionais: `font-variant-numeric: tabular-nums`.
- Ações e dados principais: 11–12 px no shell compacto. Rótulos secundários: 9–10 px. Títulos de página: 20–22 px. Textos abaixo de 9 px não devem carregar informação necessária.
- Sidebar estreita e rolável. Métricas agrupadas por conta; superfícies de lista são linhas densas, não grandes cards de marketing.

## Componentes

- Botão primário: `Logar equipe` usa verde na parte superior da sidebar, antes dos cartões. `Abrir` usa azul mais contido em cada conta. Hover ajusta fundo; pressionado desloca 1 px; foco usa contorno prateado.
- Botão de ícone: `title` e `aria-label` descritivos; foco visível. Não reduzir alvo de clique para o tamanho do SVG.
- Seleção de view: segmento com `aria-pressed`, estado visual forte e mudança instantânea de conteúdo.
- Conta: nome, estado textual, caça, métricas e ações. Estado de conexão não pulsa permanentemente.
- Lista: linhas compactas com hover discreto e botão de abertura explícito.
- Menu e drawer: surgem do respectivo acionador; foco entra na superfície, Escape fecha e devolve foco. Superfície fechada fica `inert`.
- Dialogs/inputs: continuar com os controles originais; refinar depois por grupo, preservando eventos e persistência.

## Motion language

- Feedback de hover/press: 120 ms.
- Menu/popover: 190 ms de opacidade + pequeno deslocamento, origem junto ao acionador.
- Drawer: 260 ms em `transform`, com retorno interruptível.
- Major view: troca imediata para não retardar operação ou interferir com webviews. Não animar o grid.
- Sem animação infinita de status, parallax, blur pesado ou transição de dimensões. `prefers-reduced-motion` reduz todas as transições adicionadas.

## Responsividade e acessibilidade

- A sidebar rola as contas e mantém a ação de equipe visível.
- Em largura estreita, a barra de controles opera por rolagem horizontal; nenhuma função deve desaparecer apenas por falta de espaço.
- Em altura reduzida, o rodapé ilustrativo encolhe antes da área de jogo.
- Focus ring claro, texto de estado além da cor, nomes para botões de ícone e Escape em menus/drawers.

## Critério de evolução

Cada passe deve preservar o jogo e apresentar um ganho identificável em hierarquia, leitura ou feedback. Compare a mesma tela antes/depois; testes de sintaxe são apenas um gate, não validação visual ou de carga.
