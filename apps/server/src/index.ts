import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();

app.use(cors());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

type Player = {
  id: string;
  name: string;
  hand: number[];
  ready: boolean;
  starVote: boolean;
};

type RoomStatus = 'lobby' | 'focus' | 'playing' | 'won' | 'lost';

type Room = {
  code: string;
  hostId: string;
  players: Player[];
  level: number;
  maxLevel: number;
  lives: number;
  stars: number;
  pile: number[];
  status: RoomStatus;
  message: string;
};

const rooms = new Map<string, Room>();

const rewardMap: Record<number, 'life' | 'star'> = {
  2: 'star',
  3: 'life',
  5: 'star',
  6: 'life',
  8: 'star',
  9: 'life',
};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  return Array.from(
    { length: 5 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function setupByPlayers(playerCount: number) {
  if (playerCount === 2) {
    return {
      maxLevel: 12,
      lives: 2,
    };
  }

  if (playerCount === 3) {
    return {
      maxLevel: 10,
      lives: 3,
    };
  }

  return {
    maxLevel: 8,
    lives: 4,
  };
}

function shuffle<T>(array: T[]) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function publicRoom(room: Room, viewerId: string) {
  return {
    ...room,

    players: room.players.map((player) => ({
      ...player,

      hand: player.id === viewerId ? player.hand : [],

      handCount: player.hand.length,
    })),
  };
}

function emitRoom(room: Room) {
  room.players.forEach((player) => {
    io.to(player.id).emit(
      'room',
      publicRoom(room, player.id)
    );
  });
}

function deal(room: Room) {
  const config = setupByPlayers(room.players.length);

  room.maxLevel = config.maxLevel;

  const deck = shuffle(
    Array.from(
      { length: 100 },
      (_, index) => index + 1
    )
  );

  room.players.forEach((player) => {
    player.hand = deck
      .splice(0, room.level)
      .sort((a, b) => a - b);

    player.ready = false;
    player.starVote = false;
  });

  room.pile = [];

  room.status = 'focus';

  room.message =
    `Nível ${room.level}: todos precisam ficar prontos.`;
}

function checkLevel(room: Room) {
  const everyoneFinished = room.players.every(
    (player) => player.hand.length === 0
  );

  if (!everyoneFinished) {
    return;
  }

  const reward = rewardMap[room.level];

  if (reward === 'life') {
    room.lives = Math.min(5, room.lives + 1);
  }

  if (reward === 'star') {
    room.stars = Math.min(3, room.stars + 1);
  }

  if (room.level >= room.maxLevel) {
    room.status = 'won';

    room.message =
      'Sincronia completa! A equipe venceu.';

    return;
  }

  room.level++;

  deal(room);
}

function restartLevelAfterMistake(room: Room) {
  room.pile = [];

  if (room.lives <= 0) {
    room.status = 'lost';

    room.message =
      'Sem vidas. Fim de jogo.';

    return;
  }

  deal(room);

  room.message =
    `Erro! A equipe perdeu 1 vida. O nível ${room.level} recomeçou desde a carta 0.`;
}

io.on('connection', (socket) => {
  console.log(`Jogador conectado: ${socket.id}`);

  socket.on(
    'createRoom',
    ({ name }: { name: string }) => {
      let roomCode = generateRoomCode();

      while (rooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }

      const room: Room = {
        code: roomCode,

        hostId: socket.id,

        players: [
          {
            id: socket.id,

            name: name || 'Jogador',

            hand: [],

            ready: false,

            starVote: false,
          },
        ],

        level: 1,

        maxLevel: 12,

        lives: 2,

        stars: 1,

        pile: [],

        status: 'lobby',

        message:
          'Convide seus amigos pelo código.',
      };

      rooms.set(roomCode, room);

      emitRoom(room);
    }
  );

  socket.on(
    'joinRoom',
    ({
      code,
      name,
    }: {
      code: string;
      name: string;
    }) => {
      const roomCode = (code || '')
        .trim()
        .toUpperCase();

      const room = rooms.get(roomCode);

      if (!room) {
        socket.emit(
          'errorMessage',
          'Sala não encontrada.'
        );

        return;
      }

      if (room.status !== 'lobby') {
        socket.emit(
          'errorMessage',
          'A partida já começou.'
        );

        return;
      }

      if (room.players.length >= 4) {
        socket.emit(
          'errorMessage',
          'Sala cheia. Máximo de 4 jogadores.'
        );

        return;
      }

      room.players.push({
        id: socket.id,

        name: name || 'Jogador',

        hand: [],

        ready: false,

        starVote: false,
      });

      emitRoom(room);
    }
  );

  socket.on(
    'start',
    (roomCode: string) => {
      const room = rooms.get(roomCode);

      if (!room) {
        return;
      }

      if (room.hostId !== socket.id) {
        return;
      }

      if (room.players.length < 2) {
        socket.emit(
          'errorMessage',
          'São necessários pelo menos 2 jogadores.'
        );

        return;
      }

      const config =
        setupByPlayers(room.players.length);

      room.lives = config.lives;

      room.maxLevel = config.maxLevel;

      room.level = 1;

      room.stars = 1;

      deal(room);

      emitRoom(room);
    }
  );

  socket.on(
    'ready',
    (roomCode: string) => {
      const room = rooms.get(roomCode);

      if (!room) {
        return;
      }

      if (room.status !== 'focus') {
        return;
      }

      const player = room.players.find(
        (item) => item.id === socket.id
      );

      if (!player) {
        return;
      }

      player.ready = true;

      const everyoneReady = room.players.every(
        (item) => item.ready
      );

      if (everyoneReady) {
        room.status = 'playing';

        room.message =
          'Joguem sem turnos e sem revelar números.';
      }

      emitRoom(room);
    }
  );

  socket.on(
    'play',
    ({
      code,
      value,
    }: {
      code: string;
      value: number;
    }) => {
      const room = rooms.get(code);

      if (!room) {
        return;
      }

      if (room.status !== 'playing') {
        return;
      }

      const player = room.players.find(
        (item) => item.id === socket.id
      );

      if (!player) {
        return;
      }

      /*
       * O jogador só pode jogar
       * a menor carta da própria mão.
       */
      if (player.hand[0] !== value) {
        return;
      }

      /*
       * Verifica se existe alguma carta
       * menor que a escolhida em qualquer mão.
       */
      const lowerCards = room.players
        .flatMap((item) => item.hand)
        .filter((card) => card < value);

      /*
       * Remove a carta da mão do jogador.
       */
      player.hand.shift();

      /*
       * Se existia uma carta menor,
       * foi um erro.
       *
       * REGRA PERSONALIZADA:
       * perde uma vida e recomeça
       * o mesmo nível desde 0.
       */
      if (lowerCards.length > 0) {
        room.lives--;

        if (room.lives <= 0) {
          room.status = 'lost';

          room.message =
            'Sem vidas. Fim de jogo.';

          emitRoom(room);

          return;
        }

        restartLevelAfterMistake(room);

        emitRoom(room);

        return;
      }

      /*
       * Jogada correta.
       */
      room.pile.push(value);

      room.message =
        `${player.name} jogou ${value}.`;

      checkLevel(room);

      emitRoom(room);
    }
  );

  socket.on(
    'proposeStar',
    (roomCode: string) => {
      const room = rooms.get(roomCode);

      if (!room) {
        return;
      }

      if (room.status !== 'playing') {
        return;
      }

      if (room.stars < 1) {
        return;
      }

      const player = room.players.find(
        (item) => item.id === socket.id
      );

      if (!player) {
        return;
      }

      player.starVote = true;

      room.message =
        `${player.name} propôs usar uma estrela. Todos devem confirmar.`;

      emitRoom(room);
    }
  );

  socket.on(
    'voteStar',
    (roomCode: string) => {
      const room = rooms.get(roomCode);

      if (!room) {
        return;
      }

      if (room.status !== 'playing') {
        return;
      }

      if (room.stars < 1) {
        return;
      }

      const player = room.players.find(
        (item) => item.id === socket.id
      );

      if (!player) {
        return;
      }

      player.starVote = true;

      const everyoneVoted = room.players.every(
        (item) => item.starVote
      );

      if (everyoneVoted) {
        room.stars--;

        const discarded: number[] = [];

        room.players.forEach((item) => {
          if (item.hand.length > 0) {
            const card = item.hand.shift();

            if (card !== undefined) {
              discarded.push(card);
            }
          }

          item.starVote = false;
        });

        discarded.sort((a, b) => a - b);

        room.message =
          `Estrela usada. Menores cartas descartadas: ${discarded.join(', ')}.`;

        checkLevel(room);
      }

      emitRoom(room);
    }
  );

  socket.on('disconnect', () => {
    console.log(
      `Jogador desconectado: ${socket.id}`
    );

    for (const [roomCode, room] of rooms) {
      const previousPlayerCount =
        room.players.length;

      room.players = room.players.filter(
        (player) => player.id !== socket.id
      );

      if (
        room.players.length ===
        previousPlayerCount
      ) {
        continue;
      }

      /*
       * Se todos saíram,
       * remove a sala.
       */
      if (room.players.length === 0) {
        rooms.delete(roomCode);

        continue;
      }

      /*
       * Se o host saiu,
       * passa o host para o próximo jogador.
       */
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }

      emitRoom(room);
    }
  });
});

/*
 * Rota simples para verificar
 * se o backend está funcionando.
 */
app.get('/', (_, res) => {
  res.json({
    ok: true,
    service: 'MindSync Server',
    message: 'Servidor online',
  });
});

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    service: 'MindSync Server',
  });
});

/*
 * IMPORTANTE PARA O RENDER:
 *
 * O Render define process.env.PORT.
 * Localmente usamos 3001.
 */
const PORT = Number(
  process.env.PORT || 3001
);

httpServer.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `MindSync server online na porta ${PORT}`
    );
  }
);