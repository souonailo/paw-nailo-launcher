<div align="center">

<img src="ui/src/ui/assets/paw-logo.png" width="320" alt="PAW">

<p>By</p>

<img src="ui/src/ui/assets/nailo-logo.png" width="280" alt="Nailo">

# PAW Nailo — Launcher Multi-Contas

**Quatro contas, uma equipe e muita história pra compartilhar.** 🎮

Um cantinho da comunidade para quem curte PokeIdle, boas caçadas e aquela resenha entre treinadores.

![Windows x64](https://img.shields.io/badge/Windows-x64-0078D6?style=flat-square)
![Rust](https://img.shields.io/badge/backend-Rust-D97757?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square)
![Contas](https://img.shields.io/badge/contas-4-A78BFA?style=flat-square)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-58A65C?style=flat-square)](LICENSE)

[English](README.en.md) · [Tutorial](TUTORIAL.md) · [Manual](MANUAL.md) · [FAQ](FAQ.md) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## 👋 Chega mais, treinador!

Launcher companion de PokeIdle / Poke Ascended World para Windows x64, com quatro contas fixas, WebView2 e backend nativo em Rust (Tauri v2).

> 🌱 **Primeira vez por aqui?** Comece pelo [tutorial](TUTORIAL.md). O passo a passo te acompanha na preparação do launcher.

## ⚡ Arquitetura e Otimizações de Desempenho

O PAW Nailo foi construído para máxima eficiência de processamento e estabilidade de longa duração, com backend nativo em Rust (Tauri v2) operando com uso enxuto de recursos:

- 🟣 **Modo Normal (Janelas)**: Grade de quatro contas fixas operando com instâncias isoladas no WebView2 e airspace nativo otimizado.
- 🔵 **Modo Eco**: Redução drástica da carga gráfica e de CPU (limitação de FPS do canvas, economia de processamento em segundo plano e supressão de renderizações secundárias durante o farm).
- 🩵 **Só a Caça (Imersivo)**: Remove completamente toda a HUD do jogo, deixando a tela limpa e focada exclusivamente no combate.
- 🟡 **Modo Simples (Cards)**: Visão consolidada em cartões com métricas em tempo real (kills/h, XP/h, gold/h e pokébolas) com mínimo consumo de recursos visuais.

## 🚀 Bora abrir o launcher

### 🎮 Para Jogadores (Recomendado)
1. Acesse a aba de **[Releases](https://github.com/souonailo/paw-nailo-launcher/releases)** e baixe o arquivo `PAW-Nailo-vX.X.X.zip` da versão mais recente.
2. Extraia tudo para uma pasta de sua escolha.
3. Execute **`Abrir PAW Nailo.bat`** (ou dê dois cliques diretamente em `paw-nailo-rust.exe`). O launcher abre **instantaneamente em menos de 1 segundo**, sem precisar de compiladores ou ferramentas de programação!

### 🛠️ Para Desenvolvedores (Compilar do Código)
1. Clone este repositório ou seu fork.
2. Certifique-se de ter instalado o **Rust** ([rustup](https://rustup.rs/)) e o **Visual Studio C++ Build Tools** (MSVC).
3. Execute **`Abrir PAW Nailo.bat`** na raiz para compilar e rodar, ou use **`empacotar-release.bat`** para gerar um pacote de distribuição.

## 🔄 Manter a equipe em dia

A interface principal está em `ui/`. Ela é servida localmente pelo Tauri. Reabra pelo `.bat` para carregar alterações visuais; mudanças no backend Rust em `src-tauri/` são compiladas incrementalmente.

Executáveis de versões legadas não são atualizados pelo `.bat`. Crie um atalho na sua Área de Trabalho apontando diretamente para o arquivo `Abrir PAW Nailo.bat`.

## 🧭 Por dentro do projeto

- `src-tauri/`: backend nativo em Rust, gerenciamento de webviews, configurações e permissões Tauri.
- `ui/`: interface (HTML, CSS, JavaScript, assets do jogo e ponte nativa).
- `Abrir PAW Nailo.bat`: inicializador e orquestrador de execução direta.

## 🔐 Seu cantinho no computador

O backend nativo usa `%APPDATA%/pawnailo` para dados persistentes, incluindo credenciais protegidas por DPAPI nativa no Windows. Não apague essa pasta ao atualizar.

Credenciais precisam ser enviadas aos serviços do jogo durante o login; criptografia local protege seus dados em repouso no computador. Nunca envie credenciais, cookies ou sessões em commits ou issues.

Windows x64 é o alvo oficial deste inicializador.

Licença: [MIT](LICENSE).

---

## 💬 A comunidade também faz parte

Achou um problema, teve uma ideia ou quer ajudar quem está chegando? Tem espaço pra isso aqui.

- **Encontrou um bug?** Abra uma issue contando o que aconteceu e como reproduzir. Lembre de remover dados pessoais dos prints e logs.
- **Tem uma ideia?** Conte o que ela facilitaria nas suas caçadas.
- **Quer colocar a mão no código?** O [guia de contribuição](CONTRIBUTING.md) mostra por onde começar.
- **Ficou com dúvida?** Dê uma olhada no [FAQ](FAQ.md), no [manual](MANUAL.md) e no [tutorial](TUTORIAL.md).

Vale perguntar, ensinar e discordar com respeito. Cada contribuição ajuda o próximo treinador. 💜

<div align="center">

**Boa caçada — e que venha aquele shiny!** ✨

<sub>Poke Ascended World · By Nailo · Launcher Não Oficial</sub>

</div>
