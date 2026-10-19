# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e este projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
