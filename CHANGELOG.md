# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e este projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
