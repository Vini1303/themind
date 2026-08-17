# Publicar o MindSync

## 1. Backend (Node + Socket.IO)
Publique `apps/server` em um host Node persistente (Railway, Render, Fly.io ou equivalente).

Variáveis:
- `PORT`: normalmente fornecida pelo host.
- `CLIENT_ORIGIN`: inicialmente pode ser `*`; depois use `https://SEU-PROJETO.vercel.app`.

Anote a URL HTTPS pública do backend, por exemplo:
`https://mindsync-server.example.com`

## 2. Frontend na Vercel
Crie um projeto Vercel apontando para este repositório/pasta.

Configuração:
- Root Directory: `apps/web`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Environment Variable:
- `VITE_SERVER_URL=https://URL-DO-SEU-BACKEND`

Faça o deploy.

## 3. CORS
Depois que a Vercel gerar a URL final, volte ao backend e configure:
`CLIENT_ORIGIN=https://SEU-PROJETO.vercel.app`

Republique o backend.

## 4. Teste
Abra a URL da Vercel em dois celulares/computadores:
1. Um jogador cria a sala.
2. Copia o código.
3. O outro entra pelo código.
4. O anfitrião inicia.

## Alternativa: tudo na Vercel
A Vercel atualmente oferece WebSockets em Functions. Para tornar as salas confiáveis entre várias instâncias, mova o estado de `rooms` para um Redis externo (por exemplo Upstash/Redis via Vercel Marketplace) e use Socket.IO em transporte WebSocket.
