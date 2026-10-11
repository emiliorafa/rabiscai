# Rabiscaí ✏️

Jogo multiplayer de desenho e adivinhação (inspirado no gênero do Gartic, com identidade própria) feito para estudo.
Um jogador desenha uma palavra secreta, os outros tentam adivinhar pelo chat. Sem contas, sem banco de dados, sem chaves de API.

## Como executar

Requisitos: **Node.js 18+** e npm.

```bash
npm install          # instala servidor e cliente (npm workspaces)
npm run dev          # servidor em :3001 + cliente (Vite) em http://localhost:5173
```

Abra `http://localhost:5173` em **duas abas** (ou dois navegadores), crie uma sala numa delas e entre pelo código na outra.
Para testar com o celular na mesma rede, use `http://<IP-do-computador>:5173`.

Modo "produção" (um único processo, porta 3001):

```bash
npm run build && npm start     # abra http://localhost:3001
```

Variáveis opcionais do servidor: `PORT` (3001), `ROUND_SECONDS` (90), `INTERMISSION_SECONDS` (7), `GRACE_SECONDS` (20, tempo de reconexão).
Dica: `ROUND_SECONDS=15 npm run dev` acelera os testes manuais.

## Publicação (PWA no Render)

O cliente é um PWA (manifest + service worker via `vite-plugin-pwa`): dá para "instalar" pelo navegador no celular ou no computador.
O service worker guarda só a casca do app e as fontes; o jogo em si precisa do servidor.

O deploy é um único **Web Service** Node no Render, descrito em `render.yaml`:
build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`.
No Render: **New → Blueprint**, escolha este repositório e confirme. Cada push na `main` gera um novo deploy.

## Testes

```bash
npm test             # 48 testes (vitest)
npm run typecheck    # TypeScript em servidor e cliente
```

- `rules.test.ts`: pontuação, validação de palpites, máscara, alternância de desenhistas, palavras, rate limit.
- `room.test.ts`: salas, anfitrião, reconexão, rodadas, temporizador (relógio falso), encerramento antecipado, partida completa, desenho, vazamento da palavra.
- `integration.test.ts`: servidor Socket.IO real + 2 clientes: criar/entrar, partida inteira de 4 rodadas, tentativas de trapaça, reconexão por token, limpeza de salas, spam.

## Decisões técnicas

- **React + TypeScript (Vite)** no cliente, **Node + Express + Socket.IO** no servidor, **CSS puro** e **Canvas API**. O servidor roda com `tsx` (sem etapa de build).
- **Servidor autoritativo**: toda regra (palavra, pontos, tempo, turnos) está em `server/src/game/Room.ts`. O cliente só envia intenções (chat, traços, iniciar) e renderiza o estado recebido.
- **Palavra secreta**: só existe no servidor; vai por evento privado `round:word` ao desenhista. O estado público leva apenas a máscara (`_ _ _ _`). Palpite certo nunca aparece como texto no chat. Quem já acertou só conversa com quem acertou e o desenhista, e não pode soletrar a resposta.
- **Tempo**: o servidor decide o fim da rodada (timer + `round:tick` a cada segundo). O cliente mostra a contagem a partir do prazo enviado pelo servidor.
- **Desenho**: eventos `draw:begin / points / end / clear` com coordenadas normalizadas (0–1) e espessura relativa à largura. Traços ficam guardados na sala, então quem entra ou reconecta recebe o desenho (`draw:sync`). Pointer Events: mouse, toque e caneta.
- **Reconexão**: cada jogador tem um token secreto (em `sessionStorage`). Se a conexão cai, ele fica "reconectando" por 20 s e volta ao mesmo lugar, inclusive após F5.
- **Validação**: payloads validados com zod; sessão (sala/jogador) derivada do socket no servidor; limites de tamanho, taxa de mensagens (5 / 4 s) e de eventos de desenho.

## Regras implementadas

- Pontos: 1º acerto 100, 2º 70, demais 50; desenhista +50 se houver ao menos um acerto. Ninguém pontua duas vezes.
- Rodada de 90 s; termina antes se todos que adivinham acertarem. Palavra revelada ao fim, com resultado e placar.
- Desenhista = quem desenhou menos vezes (empate: quem entrou primeiro), nunca o mesmo duas vezes seguidas havendo alternativa.
- Partida = 2 rodadas por jogador presente no início. Fim: classificação (com empates), vencedor, **Jogar novamente** e **Voltar ao lobby** (ações do anfitrião).
- Anfitrião sai/cai → o próximo jogador conectado assume. Sala vazia é apagada da memória. Se sobrar só 1 jogador conectado, a partida termina.
- "Jogar" entra numa sala pública com vaga (ou cria uma); "Criar sala" cria uma sala privada (só por código). Máx. 10 jogadores por sala.
- Quem entra no meio da partida passa a adivinhar e entra no rodízio de desenhistas.

## Estrutura

```
shared/            tipos e validações compartilhados (apelido, código, mensagens)
server/src/
  data/words.ts    130+ palavras (7 categorias, 3 dificuldades)
  game/            Room (regras), scoring, guess, drawers, RateLimiter
  rooms/           RoomManager (códigos únicos, limpeza)
  socket/          handlers e schemas zod
client/src/
  components/ pages/ hooks/ services/ styles.css
```

## Limitações conhecidas

- Estado só em memória: reiniciar o servidor apaga as salas (previsto pelo enunciado).
- Um único processo de servidor (sem escalonamento horizontal).
- Quem sai definitivamente durante a partida some do placar final.
- Sem desfazer traço; a borracha pinta de branco (o fundo é branco).
- A interface não foi verificada em navegador pelo autor (ver observação na entrega): se algo visual estiver estranho, abra uma issue ou me avise.
