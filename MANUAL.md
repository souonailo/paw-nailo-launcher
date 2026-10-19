# Manual — PAW Nailo

Para instalar e executar o launcher, consulte o [tutorial](TUTORIAL.md). O aplicativo opera com backend nativo em Rust (Tauri v2) e quatro contas simultâneas.

## Gerenciamento de Contas e Equipe

- **Sidebar lateral**: Visualize o resumo da equipe, métricas em tempo real e o estado de conexão de cada uma das quatro contas.
- **Logar equipe**: Dispara a conexão sequencial das contas configuradas.
- **Isolamento de sessão**: Cada conta opera com seu próprio contexto isolado no WebView2, sem compartilhamento de cookies ou conflito de sessões.

## Modos de Visualização e Desempenho

- **Janelas**: Exibe a grade de quatro contas fixas lado a lado.
- **Simples**: Alterna para a visualização consolidada em cartões (Fleet Analytics), ideal para monitorar a equipe com baixo consumo gráfico.
- **Modo Eco**: Ativa a economia agressiva de recursos, reduzindo a taxa de atualização do canvas e suprimindo renderizações secundárias durante o farm contínuo.
- **Só a caça**: Modo imersivo que remove toda a HUD do jogo, deixando visível apenas a área de batalha ou os cartões de caça.

## Chat do Jogo

O chat do jogo inicia aberto por padrão, operando de forma 100% nativa. Ele é ocultado automaticamente ao entrar no Modo Eco ou no modo Só a Caça para poupar espaço e processamento, e volta a ficar visível imediatamente ao desativar esses modos.

## Bandeja do Sistema e Encerramento

- Fechar a janela encerra os processos do launcher.
- Minimizar oculta o aplicativo na bandeja do sistema (tray) quando a opção estiver habilitada nas preferências.

## Dados Persistentes

Todas as credenciais e configurações locais são protegidas com a API nativa DPAPI do Windows e armazenadas no diretório `%APPDATA%/pawnailo`. Preserve essa pasta durante atualizações para manter suas contas e configurações salvas.
