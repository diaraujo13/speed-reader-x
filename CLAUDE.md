# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Overview

`speed-reader-x` é uma extensão WebExtension (Manifest V3) para **Chrome e Firefox** que faz RSVP (Rapid Serial Visual Presentation) **palavra por palavra** sobre texto selecionado em qualquer página web.

Fluxo do usuário:
1. Selecionar texto em qualquer página.
2. Botão flutuante **SpeedRead** aparece logo abaixo da seleção.
3. Clique abre um modal (em Shadow DOM) que exibe palavra por palavra na velocidade configurada.

## Stack & Decisões

- **Vanilla JS, sem build step**. Carrega como extensão "unpacked" direto. Não introduzir bundler/TS sem pedir.
- **Shadow DOM** isola o CSS do host (`#speedread-x-host` no `<body>`). Sempre injetar UI dentro do shadow para não vazar estilos.
- **API**: `chrome.*` (funciona nativamente em Firefox 121+, declarado em `browser_specific_settings.gecko.strict_min_version`).
- **Sem background script**: tudo roda no content script + página de opções. Não adicionar service worker a menos que seja necessário.

## Regras de Domínio

- `ms_por_palavra = 60000 / wpm` (RSVP por palavra — não por letra; o `prompt.md` descrevia letra, mas o produto evoluiu para palavra).
- Velocidade: 100–1000 wpm, default **300**.
- Modo disléxico: negrito **só na primeira letra** de cada palavra (renderizado via `<b>`, cor controlada por `--sr-bold` CSS variable / setting `firstLetterColor`).
- Settings persistidas em `chrome.storage.local`. Mudanças propagam ao vivo via `chrome.storage.onChanged`.
- **Temas** (em `options.js`): presets `default`, `sepia`, `journal`, `gradient-dusk`, `gradient-sunrise`, mais `custom`. Ao escolher preset, os campos individuais (`fontColor`, `backgroundColor`, `firstLetterColor`, `fontFamily`, `fontStyle`) são gravados com os valores do preset. Editar qualquer campo manualmente muda o tema para `custom` (detectado em `detectTheme()`). Backgrounds podem ser CSS gradient strings — o color picker individual não consegue representá-los, então temas com gradiente são preservados via lookup do preset no `saveAll()`.
- **Markdown**: `tokenize()` chama `stripMarkdown()` antes de splitar palavras. Remove headers, listas, code fences, ênfase, links e tabelas. O ChatGPT injector usa `innerText` (já renderizado), então o stripper só importa para fluxos de seleção em páginas com markdown source.
- **Sessão / retomada**: `chrome.storage.local.session = { text, index, ts }` guarda o ponto de leitura. `tick()` salva throttled a cada 1.5s; `pause()`, `restart()`, `toggleMinimize()` e fechar com ✕ também salvam. `openModal(text)` checa: se `session.text === text` e `session.index < words.length - 1`, retoma do índice salvo. Apertar **⏹ Stop** = `closeModal({ keepSession: false })` limpa a sessão (descarte explícito); apertar **✕ Close** preserva. **Importante**: `tick()` mantém `playerState.index` apontando sempre para a *palavra atualmente exibida* (não a próxima). Quebrar isso causa off-by-one no resume.
- **Minimize**: classe `sr-minimized` no modal aplica `position: fixed; bottom/right: 16px`, esconde `.sr-controls` e `[data-action="settings"]`, encolhe a stage. Não é um elemento separado — é o mesmo modal com layout alternativo. Botão `_` ↔ `▢` no header alterna.
- **Detecção de seleção**: usa `selectionchange` debounced em 120ms (NÃO `mouseup` — esse é race-prone com a finalização da seleção em alguns sites). `updateTrigger()` também ignora se há modal aberto não-minimizado.
- **Bridge popup → content script**: `chrome.runtime.onMessage` em `initMessageBridge()` aceita `{ type: "sr-open", text }`. O `popup.js` faz `chrome.tabs.sendMessage(activeTabId, ...)` e fecha. Falha em `chrome://`, `about:`, ou abas onde o content script ainda não carregou — popup mostra erro acionável. Requer permission `activeTab` no manifest.
- **Popup**: persiste rascunho em `chrome.storage.local.popup_draft` para não perder texto se a janela fechar acidentalmente. `Cmd/Ctrl+Enter` na textarea aciona "Ler".
- **Linear mode** (`settings.linearMode`): renderiza um `.sr-track` com TODAS as palavras lado a lado (inline-flex), e usa `transform: translateX(...)` com `cubic-bezier(0.65, 0.05, 0.36, 1)` pra deslizar o track e centralizar a palavra atual. Mask gradient nas bordas do `.sr-word` cria efeito de "fade infinito horizontal". Tick de animação = `60000/wpm * 0.85` ms (via CSS var `--sr-tick`) — termina antes do próximo tick. Todas as palavras com mesmo `font-size` e `font-weight`; só `opacity` muda (0.22 default → 1.0 atual). **Crítico**: posicionamento usa `cur.offsetLeft + offsetWidth/2` em relação a `wordEl.clientWidth/2` — NÃO `getBoundingClientRect` (gera feedback loop com transform) e NÃO `stage.clientWidth` (inclui padding 24px, dá offset constante). `.sr-track` precisa de `position: relative` pra `offsetLeft` ser confiável.
- **Atalhos de teclado** (apenas com modal aberto, ignoram quando foco está em input/textarea/contenteditable): `P`/`Space` toggle pause, `←/→` step ±1 palavra, `↑/↓` ±25 wpm, `Esc` fecha (preserva sessão). `adjustWpm()` atualiza settings, slider, label e CSS var `--sr-tick` em sincronia.
- **Auto-paste no popup**: ao abrir, se não houver `popup_draft` salvo, tenta `navigator.clipboard.readText()` (precisa de permission `clipboardRead` no manifest). Falha silenciosa se negado — usuário ainda pode usar botão "📋 Colar" manualmente.
- **Backdrop dim** (`settings.backdropDim`): `.sr-backdrop` em `position: fixed; inset: 0; z-index: 2147483645` (uma camada abaixo do modal `2147483646`). Click no backdrop fecha o modal preservando sessão. Some quando minimizado (a pílula não justifica overlay full-screen).
- **Settings ao vivo**: `chrome.storage.onChanged` no content script re-aplica tema, re-roda `render()`, e refaz `ensureBackdrop()`. Toggle de qualquer setting na página de opções reflete imediatamente em modais abertos sem precisar reabrir.

## Integração ChatGPT

- Ativada apenas quando `location.hostname` matcha `chatgpt.com` ou `chat.openai.com`.
- `MutationObserver` em `document.documentElement` detecta novas mensagens e injeta um botão `⚡ SpeedRead` em **respostas do assistente apenas** (`[data-message-author-role="assistant"]`). User messages ficam intactas.
- O botão é absolutamente posicionado no canto da mensagem, fica oculto (opacity 0) e aparece em `mouseenter`/`focus`. Estilos inline (não vai pro Shadow DOM porque precisa estar dentro do bubble do ChatGPT para o positioning relativo funcionar).
- Cada mensagem decorada recebe `data-sr-decorated="1"` para o observer não duplicar.

## Layout

```
manifest.json     # MV3, content script em <all_urls>, options_ui em aba, action.popup
content.js        # IIFE: detecta seleção, monta trigger + modal em Shadow DOM, roda RSVP, escuta runtime.onMessage
options.html/.js  # Página de configurações com preview ao vivo + temas + sobre
popup.html/.js    # Janelinha do toolbar action: textarea pra colar texto avulso
test.html         # Página local com texto pt-BR para QA manual
test-chatgpt.html # Mock de chatgpt.com (com [data-message-author-role]) para QA
dev.sh            # Lança Chrome com a extensão carregada + porta de debug 9222
```

Tudo é flat na raiz porque o `manifest.json` referencia paths relativos. Mover arquivos quebra o manifest — atualize ambos juntos.

## Comandos

```bash
./dev.sh            # Abre Chrome com a extensão + test.html (perfil isolado em /tmp)
```

`dev.sh` ativa `--remote-debugging-port=9222`, então `chrome-devtools-mcp` e `claude-in-chrome` se conectam diretamente para automação/QA. Sobrescreva o binário com `CHROME_BIN=/path/to/chrome ./dev.sh` se necessário.

Não há test runner, linter, ou build configurado. **Não criar** sem pedir explícito.

### Testar no Firefox

`about:debugging` → "Este Firefox" → "Carregar extensão temporária" → escolher `manifest.json`. (Sem script automatizado por ora.)

## Convenções de Código

- IIFE no `content.js` para evitar poluir o escopo da página host.
- Strings de UI em **pt-BR** (público-alvo do dono do repo).
- `escapeHtml` obrigatório ao injetar texto selecionado no DOM (já implementado — usar sempre).
- `z-index` da UI: trigger `2147483647`, modal `2147483646`.
- Zoom/posicionamento: trigger é `position: absolute` com coordenadas de página (`scrollY + rect.bottom`); modal é centralizado e arrastável pelo header.

## Orphan Content Script

Quando a extensão é recarregada em `chrome://extensions`, content scripts já injetados em abas existentes ficam órfãos: continuam rodando, mas todo `chrome.runtime.*` / `chrome.storage.*` lança `Extension context invalidated`. No nosso caso o `tick()` chamava `persistSession()` a cada palavra → erro spammed.

`content.js` tem `selfDestruct()` que dispara quando `chrome.runtime.id` vira `undefined` ou quando uma chamada lança esse erro. Remove host/modal/backdrop, zera `playerState`, e seta flag `orphaned = true` que `tick()` checa antes de continuar. **Toda nova chamada a `chrome.*` deve passar por `safeChrome()`** (o helper no topo do IIFE) ou checar `contextAlive()` antes — caso contrário o erro volta.

## Não Fazer

- Não usar `innerHTML` com texto da seleção sem passar por `escapeHtml`.
- Não adicionar permissões além de `storage` sem motivo concreto (a extensão não precisa de `activeTab`, `scripting`, `tabs` etc. no fluxo atual).
- Não substituir Shadow DOM por injeção de `<style>` global — quebra isolamento em sites com CSS agressivo.
- Não trocar a fórmula de timing (`60000/wpm`) por algo dependente do tamanho real da palavra; RSVP usa cadência fixa.
