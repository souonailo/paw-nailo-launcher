# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e este projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.0.11] - 2026-10-20

### Corrigido
- **Ocultação e Estado do Botão de Atualização (`#leafHeaderUpdate`)**:
  - Corrigida a especificidade CSS em `ui/src/ui/paw-game-theme.css` onde a regra `.leaf-chip { display: inline-flex !important; }` sobrescrevia o estilo inline `style="display:none;"` do botão `#leafHeaderUpdate`, forçando a exibição permanente do chip `🚀 Atualização` mesmo quando nenhuma nova versão estava disponível.
  - Adicionadas regras estritas `#leafHeaderUpdate, .leaf-chip-update { display: none !important; }` e `#leafHeaderUpdate.has-update, .leaf-chip-update.has-update { display: inline-flex !important; }`, garantindo que o botão só apareça quando uma versão comprovadamente superior for detectada pelo backend do auto-updater.
  - Corrigido o fluxo em `ui/src/ui/pokeleaf-shell.js` para limpar a classe `has-update` e redefinir `currentUpdate = null` caso a checagem falhe ou não haja versão mais recente no GitHub Releases, prevenindo cliques sem resposta (`if (!currentUpdate) return`).
  - Sincronizada a restauração de visibilidade das janelas WebView2 (`webviewSetVisible`) ao abrir e fechar o modal `#pawUpdaterOverlay`.
- **Ciclo de Vida do Auto-Login e Observador do DOM (`generate_autofill_script`)**:
  - Ajustada a verificação de conexão ativa para não abortar prematuramente na rota `/play` enquanto diálogos de login (`#auth-dialog`, `.site-auth-dialog`, `#auth-form`) ainda estiverem abertos.
  - Protegida a inicialização do `MutationObserver` no script de autofill injetado para aguardar `DOMContentLoaded` caso o nó raiz ainda não esteja montado no instante do `document_start`.

## [1.0.10] - 2026-10-19

### Otimizado
- **Pipeline Contínuo e Reativo de Conexão e Seleção de Personagens**:
  - Reescrito o script de autenticação nativa (`generate_autofill_script` em `src-tauri/src/webview_manager.rs`) como uma máquina de estados contínua e reativa de múltiplos estágios (Fase 1: Formulário de Login -> Fase 2: Lobby de Personagens -> Fase 3: Conexão In-Game).
  - Eliminado o encerramento prematuro via `clearInterval` ao submeter o formulário de login (`#auth-submit`), permitindo que o pipeline acompanhe a navegação SPA do jogo para `/characters` e selecione o slot correspondente (`ACCOUNT_INDEX`) sem interrupções.
  - Implementada detecção orientada a eventos com `MutationObserver` no `document.documentElement` e interceptação das rotas SPA (`history.pushState` e `history.replaceState` disparando `paw:locationchange` em `guest_compat.js`), reduzindo a latência de detecção de cards de personagens de 400ms para menos de 10ms assim que os cartões são renderizados pelo jogo.
  - Busca inteligente e segura do botão de entrada no cartão do personagem (`button[data-enter]`, classes primárias ou rótulos `entrar|jogar|play`), com salvaguarda explícita contra botões perigosos (excluir/deletar/remover).
  - Adicionado encerramento limpo (`cleanup()`) ao atingir `/play` ou `#app`, desligando observadores e timers para eliminar qualquer consumo desnecessário de CPU durante o jogo.
- **Remoção de Bloqueios e Delays Artificiais no Launcher (`ui/index.html`)**:
  - Eliminado o lockout de 15 segundos (`lastLogin`) para a rota do lobby (`/characters`), impedindo que a seleção automática ficasse travada por até 15s após o envio das credenciais.
  - Reduzido o debounce de transição no lobby de 2000ms para 40ms, e no login de 2000ms para 250ms, acelerando a inicialização de forma imediata.
  - Adicionado escalonamento automático de 200ms por slot na submissão de credenciais para prevenir concorrência de token Turnstile/Cloudflare ao autenticar múltiplos personagens da mesma conta.

## [1.0.9] - 2026-10-19

### Corrigido
- **Correção da Criação dos 4 Painéis e WebViews Multi-Personagens**:
  - Eliminado o erro fatal `TypeError: this.updateSocial is not a function` em `PawBattleHud.mount` (`ui/src/ui/battle-hud.js`) que abortava síncronamente o loop de inicialização `build()` em `ui/index.html` logo na primeira iteração (`i = 0`).
  - Com a remoção dessa falha e a adição de isolamento por `try/catch` em `criarPainel`, os 4 painéis e suas respectivas WebViews isoladas (`profiles/conta_1` a `profiles/conta_4`) são instanciados e inicializados normalmente para suportar os 4 personagens da conta.
- **Correção de Abertura do Modal de Treinadores / Contas**:
  - Corrigido `ReferenceError: escH is not defined` em `openAccounts` (`ui/index.html`), garantindo que o modal de configuração de conta PAW e nomes de personagens abra perfeitamente.
- **Correções de Telemetria e Sincronização de Estado (`tauri-bridge.js`)**:
  - Restaurado o registro do listener de telemetria `console-message` (`__PGST__`) nos WebViews, eliminando o falso positivo do watchdog que ficava recarregando o painel em loop ("painel 1 sem push ha 60s/180s").
  - Corrigida a avaliação de `state.live`: quando o servidor/jogo envia `incoming.live = false`, o estado desconectado é respeitado imediatamente sem sofrer fallback para `previous.live === true`.
  - Corrigida a sincronização de estoques quando `ballsKnown: true` e `ballMap: {}`, permitindo que o launcher detecte ausência de Pokébolas em tempo real sem ressuscitar estoques antigos.
  - Corrigida a atualização de equipe quando `team: []`, impedindo a ressurreição incorreta de membros anteriores.
  - Corrigido o tratamento de `ballsKnown: false` e `inventoryKnown: false` para não forçar `state.ballsKnown = true` quando os dados ainda não foram informados pelo servidor.

## [1.0.8] - 2026-10-19

### Corrigido
- **Falha de Inicialização e Execução dos Scripts Injetados de Telemetria nos WebViews**:
  - Corrigido erro de sintaxe em `src-tauri/src/gameplay_bridge.js` (bloco `else` desbalanceado que impedia a injeção do hook WebSocket).
  - Corrigido erro de sintaxe em `src-tauri/src/launcher_gameplay.js` (fechamento de chaves faltante na cadeia de mensagens que impedia a execução no WebView2).
  - Corrigida declaração do objeto `PawBattleHud` em `ui/src/ui/battle-hud.js` que causava `SyntaxError: Unexpected token '{'` na janela principal do launcher.
  - Com a resolução dessas falhas de parser, todos os scripts injetados e módulos da interface agora executam normalmente, restabelecendo a captura e transmissão de telemetria completa.

## [1.0.7] - 2026-10-19

### Corrigido
- **Resolução e Exibição de Nomes Reais de Personagens em Multi-Contas**:
  - Implementada detecção abrangente do nome real do personagem ativo através da stack inteira: suporte a `trainerName`, `characterName`, `charName`, `name`, `nick`, `nome` e `character.name` no backend Rust (`game_headless.rs`), no WebSocket bridge (`gameplay_bridge.js`) e no coletor de estado do WebView (`READ_STATE`).
  - Adicionada detecção antecipada do nome do personagem já no lobby (`/characters`) através do card correspondente ao slot (`data-character-slot` e `.lobby-character-card`), emitindo o evento nativo `character_selected`.
  - Adicionado fallback via DOM e `localStorage` no jogo: extração segura de `#game-chat .chat-footer span:first-child`, `.expedition-card .profile b` e `.trainer-profile .profile b`, com higienização de prefixos ("Conectado como", etc.).
  - Filtro contra sobrescrita por placeholders: garantido que identificadores genéricos ("Personagem 1", "Conta 1", "—", "Sem líder") nunca substituam um nome real previamente identificado na telemetria, na barra lateral, nos cabeçalhos de painel e no modal de contas.
  - Sincronização e persistência automática: quando o nome real de um personagem é identificado na telemetria, `accounts[i].name` e `tabNames[i]` são atualizados em memória e gravados em disco automaticamente.
- **Persistência de Telemetria, Time de Pokémon e Estoque de Pokébolas**:
  - Eliminado o bug onde o time e as Pokébolas desapareciam após ~1 minuto de jogo devido à expiração do cache e releitura destrutiva por `readPanelState(i)`.
  - O `READ_STATE` agora utiliza correspondência resiliente de UIDs dos slots da equipe (`p.uid === uid || p.id === uid || String(p.uid) === String(uid)`), com fallback garantido para os primeiros 6 Pokémon caso os slots de equipe não coincidam estritamente, além de suporte a múltiplas propriedades de time (`team`, `pokemons`) e seletores DOM expandidos (`.expedition-card .expedition-pokemon`, `button.expedition-pokemon`).
  - Suporte completo no `READ_STATE` para contagens numéricas de bolas (`balls`, `normalBalls`, `greatBalls`, `ultraBalls`, `idleBalls`) em `bMap`.
  - Mesclagem não-destrutiva em `readPanelState(i)` e `dispatchToApp`: impede terminantemente que um time não-vazio seja substituído por um array vazio (`[]`) ou que estoques conhecidos de bolas sejam zerados por leituras transitórias vazias.
  - O status de conexão (`isLive`) agora permanece ativo e estável sem oscilar para "Conectando" ou "Time ainda não carregado".

## [1.0.6] - 2026-10-19

### Corrigido
- **Bloqueio Definitivo da Opção 'Entrar em nova aba' (`#lobby-new-tab`)**:
  - Garantido que o checkbox de entrar em nova aba permaneça sempre desmarcado e travado nas WebViews do jogo (`checked = false`), impedindo o erro fatal `tab.location.replace is not a function` ao selecionar um personagem no lobby (`/characters`).
  - Interceptação de `Object.defineProperty` para a propriedade `checked` do elemento `#lobby-new-tab`, assegurando retorno incondicional de `false` mesmo quando o script oficial do jogo invoca `preferences.read(...)`.
  - Sobrescrita de `window.PAW_CHARACTER_PREFERENCES` nas instâncias WebView2 para que o leitor de preferências de personagens sempre retorne `false` para abas externas.
  - Implementação completa dos métodos `location.replace` e `location.assign` no mock de janela do `guest_compat.js` como salvaguarda adicional, redirecionando a própria janela caso `window.open` retorne o objeto compatível.
  - Desmarcação automática garantida também durante o ciclo de seleção de personagens pelo motor nativo de automação (`webview_manager.rs`).

## [1.0.5] - 2026-10-19

### Corrigido
- **Correção Visual e Airspace do Modal de Auto-Atualização**:
  - Corrigida a regra CSS de `.paw-modal-overlay` em `paw-game-theme.css`, que possuía `display: flex !important` incondicional, fazendo com que o modal de auto-atualização fosse renderizado logo na inicialização por trás e entre as frestas das 4 WebViews nativas do jogo.
  - O modal agora permanece oculto por padrão (`display: none !important`) e só é exibido quando a classe `.show` for ativada explicitamente pelo fluxo de atualização.
  - Sincronização atômica de visibilidade no `tauri-bridge.js`: quando o modal de atualização é aberto, todas as 4 WebViews nativas do WebView2 são ocultadas imediatamente (`webviewSetVisible(false)`), eliminando qualquer colisão de airspace ou corte de tela no Windows.
- **Formatação Compacta e Responsiva do Diálogo de Autenticação PAW**:
  - Injetado estilo responsivo dedicado para o elemento `dialog#auth-dialog.site-auth-dialog`, reduzindo paddings, tamanhos de fonte, campos de texto e espaçamentos para que todo o formulário (incluindo o widget de segurança Turnstile e o botão "Entrar no jogo") caiba integralmente dentro da altura dos painéis do launcher sem gerar barras de rolagem ou cortar controles.
- **Autofill, Verificação de Segurança (Turnstile) e Seleção de Personagem**:
  - Aprimorado o script de preenchimento automático para detectar o widget do Cloudflare Turnstile (`#login-turnstile`, `input[name="cf-turnstile-response"]` e status de verificação), garantindo que a submissão via `findBtn().click()` só ocorra após a conclusão da verificação.
  - Adicionado suporte à rota de lobby `/characters`: o launcher agora identifica automaticamente o cartão do personagem correspondente ao slot do painel (`ACCOUNT_INDEX`) e clica no botão "Entrar no mundo".
  - Corrigido o filtro de URLs de navegação (`isPawAuth`) no `index.html` para disparar o preenchimento automático em rotas `/welcome`, `/characters` e `/play`.

## [1.0.4] - 2026-10-19

### Adicionado
- **Suporte ao Novo Sistema de Conta Única com 4 Personagens (PAW Single Account Model)**:
  - Adaptação completa do launcher para a nova mecânica oficial do Poke Ascended World (PAW), onde um único e-mail/senha dá acesso a até 4 personagens.
  - Simplificação do modal de Treinadores: substituído o formulário repetitivo de 4 contas por um card elegante e intuitivo de Conta Única PAW com E-mail, Senha com visualizador (mostrar/ocultar) e ações rápidas para limpar credenciais ou limpar cookies e cache de todos os painéis.
  - Painel de visualização e edição rápida dos 4 personagens vinculados aos 4 painéis da equipe, com botão de limpeza individual de dados para manutenção de sessões (`conta_1` a `conta_4`).
  - Propagação atômica das credenciais da conta única para as 4 partições isoladas de WebView2, garantindo que "Logar equipe" e os scripts de preenchimento automático funcionem simultaneamente nos 4 painéis sem conflitos.
  - Detecção e exibição em tempo real dos nomes reais dos personagens na barra lateral e nos painéis via telemetria autoritativa do servidor.
  - Atualização em toda a interface do termo "Conta" para "Personagem" (sidebar, contadores de equipe, visualização em lista e traduções em Português, Inglês e Espanhol).
  - Migração automática no backend Rust (`credentials.rs`) de credenciais legadas de "Conta X" para "Personagem X".

## [1.0.3] - 2026-10-19

### Adicionado
- **Auto-Atualizador Nativo via GitHub Releases**:
  - Verificação automática e não intrusiva de novas versões publicadas no repositório GitHub (`souonailo/paw-nailo-launcher`).
  - Botão interativo e discreto na barra superior (`#leafHeaderUpdate`) que alerta quando uma nova versão com executável estiver disponível, sem interromper as sessões ou desconectar contas em batalha.
  - Modal de atualização com exibição de notas de lançamento, barra de progresso em tempo real e confirmação segura pelo usuário.
  - Atualização in-loco (in-place swap) atômica no Windows: descarrega o novo binário em arquivo temporário, renomeia o executável em execução sem travamento de arquivo do sistema operacional, instala o novo `PAW-Nailo.exe`, executa a nova versão e fecha a versão anterior.
  - Limpeza automática de arquivos temporários (`.old.tmp` e `.download.tmp`) no ciclo de inicialização do launcher.

## [1.0.2] - 2026-10-19

### Corrigido
- **Telemetria e Contagem de Pokébolas**:
  - Corrigida a extração de inventário no bridge de telemetria (`READ_STATE`): a soma de pokébolas antes considerava exclusivamente chaves simbólicas (`ultraBalls`, `greatBalls`), ignorando IDs numéricos mapeados (`1`, `2`, `3`, `4`, `5`) transmitidos pelo servidor do jogo, o que zerava a quantidade total e a bola equipada.
  - Sincronização robusta de catálogo de bolas com fallback nominal e identificação correta da bola prioritária ativa.
  - Preservação da autoridade dos estados do servidor no backend headless Rust, eliminando predição especulativa em eventos de batalha que causava dessincronização de estoque.
- **Reprodução de Áudio e Desbloqueio de Autoplay no WebView2**:
  - Adicionada a flag de inicialização do Chromium `--autoplay-policy=no-user-gesture-required` no WebView2, permitindo que os efeitos sonoros (SFX de shiny spawn, captura e combate) sejam reproduzidos mesmo sem interação direta com o canvas do jogo.
  - Resolução de áudio contexts suspensos (`AudioContext.resume()`) e sincronização imediata de `Howler.mute` e `Howler.volume(1.0)` ao desmutar o launcher.
  - Correção na inicialização dos estados de mudo (`gameMuted`) no topo do script para evitar acessos antes da declaração e manter a integridade visual da interface.

## [1.0.1] - 2026-10-19

### Adicionado
- **Controle Dinâmico de Áudio (Mutar/Desmutar)**:
  - Adicionado botão interativo de áudio ("Som" / "Mudo") na barra superior do launcher (`leafAudio`) e no menu de opções (`audioToggle`).
  - Atalho de teclado rápido (`S`) para alternar som ativo e mudo instantaneamente.
  - Persistência da preferência de áudio do usuário no armazenamento local (`gameMuted`).

### Corrigido
- **Áudio Nativo do Jogo**:
  - Corrigido problema onde o som do jogo ficava 100% mutado de forma incondicional no carregamento das janelas e sincronizações.
  - Sincronização em dupla camada: aplicação direta no WebView2 nativo do Windows (`ICoreWebView2_8::SetIsMuted`) e no engine de som web (`Howler.mute`).

## [1.0.0] - 2026-10-18

### Adicionado
- **Lançamento Oficial PAW Nailo v1.0.0**: Companion nativo de alto desempenho para Poke Ascended World (PAW) e PokeIdle.
- **Backend Nativo em Rust (Tauri v2)**: Arquitetura em Rust com consumo mínimo de recursos, airspace inteligente para WebView2 e estabilidade de longa duração.
- **Operação de Quatro Contas Fixas**: Suporte a quatro painéis simultâneos com isolamento total de cookies, sessões e armazenamento local.
- **Identidade Visual PAW Prisma HUD**: Interface cyber-navy com design system oficial, molduras metálicas chanfradas e compatibilidade completa com o visual do jogo.
- **Chat do Jogo 100% Nativo e Integrado**: O chat inicia aberto por padrão como no jogo oficial, com descolapso síncrono e suporte nativo às engines de mensagem.
- **Controle de Janela Nativo e Minimizar para a Bandeja (System Tray)**:
  - Botão de minimizar com envio para a área de notificação do Windows (system tray), liberando a barra de tarefas.
  - Ícone de bandeja interativo com suporte a clique para restaurar e menu de contexto.
  - Proteção estrita contra arraste involuntário em controles de janela (`-webkit-app-region: no-drag`).
- **Reatividade a Modos Operacionais**:
  - **Modo Eco**: Redução drástica de CPU/GPU; oculta o chat e renderizações secundárias durante o farm, restaurando-os ao sair.
  - **Só a Caça (Modo Imersivo)**: Remove completamente a HUD do jogo para foco total na caça, restaurando tudo ao ser desligado.
  - **Modo Simples (Cards)**: Visão consolidada em cartões de métricas da equipe em campo.
- **Telemetria e Métricas em Tempo Real**: Acompanhamento de kills/h, XP/h, gold/h, capturas, contagem de pokébolas e líder da equipe em campo.
- **Segurança de Credenciais**: Armazenamento criptografado de contas via DPAPI nativa do Windows.
