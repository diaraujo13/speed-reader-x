# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Overview

`speed-reader-x` é uma extensão WebExtension (Manifest V3) para **Chrome e Firefox** que faz RSVP (Rapid Serial Visual Presentation) **palavra por palavra** sobre texto selecionado em qualquer página web.

Fluxo do usuário:
1. Selecionar texto em qualquer página.
2. Botão flutuante **SpeedRead** aparece logo abaixo da seleção.
3. Clique abre um modal (em Shadow DOM) que exibe palavra por palavra na velocidade configurada.

Fluxos alternativos para texto avulso (colar):
- **Popup do toolbar** (`popup.html`): textarea pequena; manda o texto pro content script da aba ativa.
- **Leitor de página inteira** (`reader.html`): aba dedicada com textarea gigante + o motor RSVP rodando na própria página. Abre automaticamente ao clicar no ícone numa página interna (chrome://, about:, Web Store) — onde não há content script — ou pelo link "Abrir em aba ↗" do popup.

## Stack & Decisões

- **Vanilla JS, sem build step**. Carrega como extensão "unpacked" direto. Não introduzir bundler/TS sem pedir.
- **Shadow DOM** isola o CSS do host (`#speedread-x-host` no `<body>`). Sempre injetar UI dentro do shadow para não vazar estilos.
- **API**: `chrome.*` (funciona nativamente em Firefox 121+, declarado em `browser_specific_settings.gecko.strict_min_version`).
- **Background mínimo** (`background.js`): service worker no Chrome / event page não-persistente no Firefox (declarado em `background` com `service_worker` + `scripts` pra cobrir os dois). Só registra listeners no escopo de topo, **sem estado persistente e sem tocar DOM** (roda igual nos dois modelos de execução). Papel ÚNICO: (a) `chrome.action.setPopup` por aba — limpa o popup em páginas internas (chrome://, about:, Web Store) pra que o clique do ícone caia em `action.onClicked`; (b) `action.onClicked` abre (ou reaproveita) `reader.html` numa aba dedicada. **Não** colocar lógica de RSVP/negócio aqui — o motor de leitura vive em `content.js` e `reader.js`.

## Regras de Domínio

- `ms_por_palavra = 60000 / wpm` (RSVP por palavra — não por letra; o `prompt.md` descrevia letra, mas o produto evoluiu para palavra).
- Velocidade: 100–1000 wpm, default **300**.
- Modo disléxico: negrito **só na primeira letra** de cada palavra (renderizado via `<b>`, cor controlada por `--sr-bold` CSS variable / setting `firstLetterColor`).
- Settings persistidas em `chrome.storage.local`. Mudanças propagam ao vivo via `chrome.storage.onChanged`.
- **Temas** (em `options.js`): presets `default`, `sepia`, `journal`, `gradient-dusk`, `gradient-sunrise`, mais `custom`. Ao escolher preset, os campos individuais (`fontColor`, `backgroundColor`, `firstLetterColor`, `fontFamily`, `fontStyle`) são gravados com os valores do preset. Editar qualquer campo manualmente muda o tema para `custom` (detectado em `detectTheme()`). Backgrounds podem ser CSS gradient strings — o color picker individual não consegue representá-los, então temas com gradiente são preservados via lookup do preset no `saveAll()`.
- **Markdown**: `tokenize()` chama `stripMarkdown()` antes de splitar palavras. Remove headers, listas, code fences, ênfase, links e tabelas. O ChatGPT injector usa `innerText` (já renderizado), então o stripper só importa para fluxos de seleção em páginas com markdown source.
- **Sessão / retomada**: `chrome.storage.local.session = { text, index, ts }` guarda o ponto de leitura. `tick()` salva throttled a cada 1.5s; `pause()`, `restart()`, `toggleMinimize()` e fechar com ✕ também salvam. `openModal(text)` checa: se `session.text === text` e `session.index < words.length - 1`, retoma do índice salvo. Apertar **⏹ Stop** = `closeModal({ keepSession: false })` limpa a sessão (descarte explícito); apertar **✕ Close** preserva. **Importante**: `tick()` mantém `playerState.index` apontando sempre para a *palavra atualmente exibida* (não a próxima). Quebrar isso causa off-by-one no resume. O **leitor de página inteira** (`reader.js`) mantém uma sessão SEPARADA em `chrome.storage.local.reader_session` (mesma forma `{ text, index, ts }`), independente da `session` do modal — são contextos distintos com textos potencialmente diferentes; não unificar as chaves.
- **Minimize**: classe `sr-minimized` no modal aplica `position: fixed; bottom/right: 16px`, esconde `.sr-controls` e `[data-action="settings"]`, encolhe a stage. Não é um elemento separado — é o mesmo modal com layout alternativo. Botão `_` ↔ `▢` no header alterna.
- **Detecção de seleção**: usa `selectionchange` debounced em 120ms (NÃO `mouseup` — esse é race-prone com a finalização da seleção em alguns sites). `updateTrigger()` também ignora se há modal aberto não-minimizado.
- **Bridge popup → content script**: `chrome.runtime.onMessage` em `initMessageBridge()` aceita `{ type: "sr-open", text }`. O `popup.js` faz `chrome.tabs.sendMessage(activeTabId, ...)` e fecha. Em página interna/restrita (detectada por `isRestricted()` em `popup.js`, **mesma lista do `background.js`** — manter em sincronia) o popup NÃO mostra erro: faz fallback chamando `openReaderTab()` e abre o leitor de página inteira. O erro acionável ("recarregue a aba") fica só para abas normais onde o content script ainda não carregou. Requer permission `activeTab` no manifest.
- **Popup**: persiste rascunho em `chrome.storage.local.popup_draft` para não perder texto se a janela fechar acidentalmente. `Cmd/Ctrl+Enter` na textarea aciona "Ler". O link "Abrir em aba ↗" (`#open-tab`) grava o texto atual em `popup_draft` e abre/reaproveita `reader.html`; o reader lê esse mesmo `popup_draft` na inicialização e ao vivo via `storage.onChanged` (handoff bidirecional popup ↔ reader).
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

## Leitor de Página Inteira (reader.html / reader.js)

Aba dedicada da extensão para ler texto colado SEM depender de uma página host — usada quando o ícone é clicado numa página interna (chrome://, about:, Web Store), onde o content script não roda. É "o popup, estendido": textarea gigante + o motor RSVP rodando na própria página.

- **Entrada**: `background.js` limpa o popup nessas páginas → clique cai em `action.onClicked` → abre/reaproveita `reader.html`. Também acessível pelo link "Abrir em aba ↗" do popup.
- **Motor**: `reader.js` espelha o RSVP do `content.js` (`tokenize`, `stripMarkdown`, `wordDelay`, modo linear, modo disléxico, atalhos, fórmula `60000/wpm`, `--sr-tick` a 0.85). **NÃO** usa Shadow DOM (página nossa, sem CSS hostil) nem orphan handling (`chrome.*` está sempre vivo numa página de extensão). Aplica tema lendo as cores JÁ resolvidas do storage (como o content.js — sem depender de `THEMES`).
- **Views**: alterna `#input-view` ↔ `#reader-view` via atributo `hidden`. **Crítico**: `startReading()` chama `showReaderView()` ANTES de `buildPlayer()` — o modo linear mede `wordEl.clientWidth` em `render()`, que é 0 enquanto a view está `display:none` (desalinha; com 1 palavra seria permanente, pois o tick final não recorrige). `render()` ainda guarda `clientWidth > 0`, e há listener de `resize` (debounced via rAF) porque a stage do reader é fluida (`clamp/vw`), diferente do modal de largura fixa do content.js.
- **Sessão**: `reader_session` (separada da `session` do modal in-page).

## Estatísticas (stats-core.js / stats.html / stats.js)

Métricas de leitura agregadas em `chrome.storage.local.stats` e exibidas num dashboard de página inteira.

- **`stats-core.js`** — lógica PURA (sem `chrome.*`, sem DOM), exposta em `globalThis.SRStats`: schema, `mergeStats(prev, delta, dayKey)`, `summarize()`, `lastNDays()`. Carregado no mundo isolado do content script (**1º item de `content_scripts.js`, ANTES de `content.js`**) e nas páginas `reader.html`/`stats.html`. **Não** chamar `chrome.*` aqui — quem persiste faz o `get→merge→set` (envolto em `safeChrome` no content.js). Assim é seguro nos dois contextos e não dispara "Extension context invalidated".
- **Schema**: `{ v:1, totals:{readings,words,ms}, bySource:{modal,reader,chatgpt}, byDay:{ "YYYY-MM-DD": {…,bySource} } }`. `words` = palavras (tokens) exibidas no RSVP durante a reprodução; `ms` = tempo ATIVO (só tocando); `readings` = leituras iniciadas. Dia em fuso LOCAL.
- **Instrumentação** (`content.js` e `reader.js`): cada `tick()` soma 1 palavra; `play()` marca `playStartedAt`; `pause()`/fim acumulam `ms` e dão flush; flush throttled a cada 5s em leituras longas; `reader.js` também faz flush em `pagehide`. Deltas são zerados otimisticamente no flush pra não re-somar. **Origem**: `content.js` passa `source` em `openModal(text, source)` — `"modal"` (seleção/popup) ou `"chatgpt"`; `reader.js` é sempre `"reader"` (rotulado "Aba" na UI). Adições são puramente aditivas — **não** mexem na semântica de `index` (off-by-one).
- **Dashboard** (`stats.html`/`stats.js`): cards (leituras, palavras, wpm efetivo = palavras ÷ minutos ativos, tempo total) + gráfico de barras empilhadas SVG (sem libs) dos últimos 14 dias + breakdown por origem. Atualiza ao vivo via `storage.onChanged`. Botão "Limpar" usa confirmação inline (NÃO `confirm()`). Entrada por links em `options.html`, `popup.html` e `reader.html` (`#open-stats`).

## Layout

```
manifest.json     # MV3, content_scripts [stats-core.js, content.js] em <all_urls>, options_ui em aba, action.popup, background, permissão tabs
stats-core.js     # Lógica pura de estatísticas (globalThis.SRStats): schema + merge + agregação. Sem chrome.*/DOM.
content.js        # IIFE: detecta seleção, monta trigger + modal em Shadow DOM, roda RSVP, registra stats, escuta runtime.onMessage
background.js     # SW (Chrome) / event page (Firefox): troca o popup por aba e abre reader.html em páginas internas
options.html/.js  # Página de configurações com preview ao vivo + temas + sobre + link p/ estatísticas
popup.html/.js    # Janelinha do toolbar action: textarea pra colar texto avulso
reader.html/.js   # Leitor de página inteira (aba dedicada): textarea gigante + motor RSVP portado do content.js
stats.html/.js    # Dashboard de estatísticas: cards + gráfico SVG por dia + breakdown por origem
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
- Não adicionar permissões sem motivo concreto. Em uso hoje: `storage`, `activeTab` (popup lê a URL da aba ativa), `clipboardRead` (auto-paste), `tabs` (background.js lê `tab.url` pra detectar páginas internas, gerencia o popup por aba e abre `reader.html`). Não adicionar `scripting`, `host_permissions` amplas etc. sem justificativa.
- Não substituir Shadow DOM por injeção de `<style>` global — quebra isolamento em sites com CSS agressivo.
- Não trocar a fórmula de timing (`60000/wpm`) por algo dependente do tamanho real da palavra; RSVP usa cadência fixa.
