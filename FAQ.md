# Perguntas frequentes — PAW Nailo Rust

## Qual arquivo abre o launcher?

**`Abrir PAW Nailo.bat`** na raiz da pasta. Se o binário nativo já estiver compilado, ele abre de imediato em menos de um segundo.

## Preciso instalar Node.js ou Python?

Não. O launcher possui backend 100% nativo em Rust (Tauri v2) e interface WebView2. Não requer Node.js nem Python para ser executado.

## Por que a primeira compilação pode demorar?

Na primeira vez em que você compila o projeto pelo código-fonte, o Cargo baixa e compila as dependências do Rust (crates do ecossistema Tauri e Windows API). As aberturas seguintes utilizam o cache compilado e iniciam instantaneamente.

## Como faço alterações na interface?

A interface do aplicativo fica na pasta `ui/` (HTML, CSS e JavaScript). Basta editar o arquivo desejado e reiniciar o aplicativo pelo `Abrir PAW Nailo.bat`. Não é necessário compilar o backend para mudanças visuais.

## Como faço alterações no backend?

O código Rust fica em `src-tauri/src/`. Após alterar, execute `Abrir PAW Nailo.bat --build` ou `cargo build` dentro da pasta `src-tauri`.

## Onde ficam salvas minhas contas e senhas?

Os dados persistentes e as credenciais são criptografados com a DPAPI nativa do Windows e armazenados em `%APPDATA%/pawnailo`. Suas credenciais nunca são expostas em texto puro.

## Fechar a janela encerra o aplicativo?

Sim. Fechar a janela encerra os processos. Se a opção de minimizar para a bandeja estiver ativada, minimizar oculta o aplicativo na bandeja do sistema (tray).
