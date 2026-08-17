# MindSync

MVP multiplayer inspirado na mecânica cooperativa de sincronização de cartas numéricas. Identidade visual própria; não inclui logotipo, arte, textos ou assets oficiais de terceiros.

## Rodar localmente

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- Socket server: http://localhost:3001

Para hospedar o servidor separadamente, defina `VITE_SERVER_URL` no build do frontend.

## Web + mobile
A interface é responsiva e funciona como PWA/web mobile. Para empacotar como aplicativo nativo, adicione Capacitor ao app web (`@capacitor/core`, `@capacitor/cli`, Android/iOS) e aponte o build para `apps/web/dist`.

## Incluído
- Criar sala e entrar por código
- 2 a 4 jogadores
- Estado autoritativo no servidor
- Mãos privadas por socket
- 100 cartas numéricas
- Níveis 1-12/10/8 conforme quantidade de jogadores
- Vidas e estrelas
- Detecção automática de carta fora de ordem
- Votação unânime para usar estrela
- Tutorial inicial
- Replay

## Próximos passos para produção
- Redis adapter do Socket.IO para múltiplas instâncias
- Persistência/reconexão por token de jogador
- Rate limiting e validação de payloads
- Testes unitários da máquina de estados
- PWA manifest/service worker e Capacitor
- Áudio/haptics configuráveis
