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

type ResourceType = 'star' | 'life' | 'double';

type Player = {
  id: string;
  name: string;
  hand: number[];
  ready: boolean;
  resourceVote: boolean;
};

type RoomStatus =
  | 'lobby'
  | 'focus'
  | 'playing'
  | 'won'
  | 'lost';

type Room = {
  code: string;
  hostId: string;
  players: Player[];

  level: number;
  maxLevel: number;

  lives: number;

  pile: number[];

  status: RoomStatus;
  message: string;

  starCardAvailable: boolean;
  lifeCardAvailable: boolean;
  doubleChanceAvailable: boolean;

  doubleChanceActive: boolean;

  resourceProposal: ResourceType | null;
};

const rooms = new Map<string, Room>();

function generateRoomCode() {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  return Array.from(
    { length: 5 },
    () =>
      chars[
        Math.floor(
          Math.random() * chars.length
        )
      ]
  ).join('');
}

function setupByPlayers(
  playerCount: number
) {
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

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [result[i], result[j]] = [
      result[j],
      result[i],
    ];
  }

  return result;
}

function resetVotes(room: Room) {
  room.players.forEach((player) => {
    player.resourceVote = false;
  });
}

function publicRoom(
  room: Room,
  viewerId: string
) {
  return {
    ...room,

    players: room.players.map(
      (player) => ({
        ...player,

        hand:
          player.id === viewerId
            ? player.hand
            : [],

        handCount:
          player.hand.length,
      })
    ),
  };
}

function emitRoom(room: Room) {
  room.players.forEach((player) => {
    io.to(player.id).emit(
      'room',
      publicRoom(
        room,
        player.id
      )
    );
  });
}

function deal(room: Room) {
  const config =
    setupByPlayers(
      room.players.length
    );

  room.maxLevel =
    config.maxLevel;

  const deck = shuffle(
    Array.from(
      { length: 100 },
      (_, index) => index + 1
    )
  );

  room.players.forEach(
    (player) => {
      player.hand = deck
        .splice(
          0,
          room.level
        )
        .sort(
          (a, b) => a - b
        );

      player.ready = false;
      player.resourceVote = false;
    }
  );

  room.pile = [];

  room.resourceProposal = null;

  room.status = 'focus';

  room.message =
    `Nível ${room.level}: todos precisam ficar prontos.`;
}

function startNewGame(
  room: Room
) {
  const config =
    setupByPlayers(
      room.players.length
    );

  room.level = 1;

  room.maxLevel =
    config.maxLevel;

  room.lives =
    config.lives;

  /*
   * Toda nova partida começa
   * com exatamente uma carta
   * de cada recurso.
   */
  room.starCardAvailable = true;
  room.lifeCardAvailable = true;
  room.doubleChanceAvailable = true;

  room.doubleChanceActive = false;

  room.resourceProposal = null;

  resetVotes(room);

  deal(room);
}

function restartGameAfterLoss(
  room: Room
) {
  startNewGame(room);

  room.message =
    'Todas as vidas acabaram. A partida recomeçou no nível 1 com as três cartas especiais restauradas.';
}

function restartLevelAfterMistake(
  room: Room,
  protectedByDoubleChance = false
) {
  room.pile = [];

  deal(room);

  if (protectedByDoubleChance) {
    room.message =
      `◈ Chance Dupla protegeu a equipe! Nenhuma vida foi perdida. O nível ${room.level} recomeçou.`;

    return;
  }

  room.message =
    `Erro! A equipe perdeu 1 vida. O nível ${room.level} recomeçou desde o início.`;
}

function checkLevel(room: Room) {
  const everyoneFinished =
    room.players.every(
      (player) =>
        player.hand.length === 0
    );

  if (!everyoneFinished) {
    return;
  }

  if (
    room.level >=
    room.maxLevel
  ) {
    room.status = 'won';

    room.message =
      'Sincronia completa! A equipe venceu.';

    return;
  }

  room.level++;

  deal(room);
}

function resourceName(
  resource: ResourceType
) {
  if (resource === 'star') {
    return 'Estrela Ninja';
  }

  if (resource === 'life') {
    return 'Vida Extra';
  }

  return 'Chance Dupla';
}

function isResourceAvailable(
  room: Room,
  resource: ResourceType
) {
  if (resource === 'star') {
    return room.starCardAvailable;
  }

  if (resource === 'life') {
    return room.lifeCardAvailable;
  }

  return room.doubleChanceAvailable;
}

function executeResource(
  room: Room,
  resource: ResourceType
) {
  room.resourceProposal = null;

  resetVotes(room);

  if (resource === 'star') {
    if (
      !room.starCardAvailable
    ) {
      return;
    }

    room.starCardAvailable =
      false;

    const discarded: number[] =
      [];

    room.players.forEach(
      (player) => {
        if (
          player.hand.length === 0
        ) {
          return;
        }

        const card =
          player.hand.shift();

        if (
          card !== undefined
        ) {
          discarded.push(card);
        }
      }
    );

    discarded.sort(
      (a, b) => a - b
    );

    room.message =
      discarded.length > 0
        ? `✦ Estrela Ninja usada. Menores cartas removidas: ${discarded.join(', ')}.`
        : '✦ Estrela Ninja usada. Não havia cartas para remover.';

    checkLevel(room);

    return;
  }

  if (resource === 'life') {
    if (
      !room.lifeCardAvailable
    ) {
      return;
    }

    const config =
      setupByPlayers(
        room.players.length
      );

    /*
     * A vida extra só é consumida
     * se realmente puder recuperar
     * uma vida.
     */
    if (
      room.lives >=
      config.lives
    ) {
      room.message =
        '♥ A equipe já está com o máximo de vidas. A carta Vida Extra não foi gasta.';

      return;
    }

    room.lifeCardAvailable =
      false;

    room.lives++;

    room.message =
      '♥ Vida Extra usada. A equipe recuperou 1 vida.';

    return;
  }

  if (
    !room.doubleChanceAvailable
  ) {
    return;
  }

  room.doubleChanceAvailable =
    false;

  room.doubleChanceActive =
    true;

  room.message =
    '◈ Chance Dupla ativada! O próximo erro da equipe não fará perder uma vida.';
}

io.on(
  'connection',
  (socket) => {
    console.log(
      `Jogador conectado: ${socket.id}`
    );

    socket.on(
      'createRoom',
      ({
        name,
      }: {
        name: string;
      }) => {
        let roomCode =
          generateRoomCode();

        while (
          rooms.has(roomCode)
        ) {
          roomCode =
            generateRoomCode();
        }

        const room: Room = {
          code: roomCode,

          hostId: socket.id,

          players: [
            {
              id: socket.id,

              name:
                name ||
                'Jogador',

              hand: [],

              ready: false,

              resourceVote:
                false,
            },
          ],

          level: 1,
          maxLevel: 12,

          lives: 2,

          pile: [],

          status: 'lobby',

          message:
            'Convide seus amigos pelo código.',

          starCardAvailable:
            true,

          lifeCardAvailable:
            true,

          doubleChanceAvailable:
            true,

          doubleChanceActive:
            false,

          resourceProposal:
            null,
        };

        rooms.set(
          roomCode,
          room
        );

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
        const roomCode =
          (code || '')
            .trim()
            .toUpperCase();

        const room =
          rooms.get(roomCode);

        if (!room) {
          socket.emit(
            'errorMessage',
            'Sala não encontrada.'
          );

          return;
        }

        if (
          room.status !==
          'lobby'
        ) {
          socket.emit(
            'errorMessage',
            'A partida já começou.'
          );

          return;
        }

        if (
          room.players.length >= 4
        ) {
          socket.emit(
            'errorMessage',
            'Sala cheia. Máximo de 4 jogadores.'
          );

          return;
        }

        room.players.push({
          id: socket.id,

          name:
            name ||
            'Jogador',

          hand: [],

          ready: false,

          resourceVote:
            false,
        });

        emitRoom(room);
      }
    );

    socket.on(
      'start',
      (
        roomCode: string
      ) => {
        const room =
          rooms.get(roomCode);

        if (!room) {
          return;
        }

        if (
          room.hostId !==
          socket.id
        ) {
          return;
        }

        if (
          room.players.length < 2
        ) {
          socket.emit(
            'errorMessage',
            'São necessários pelo menos 2 jogadores.'
          );

          return;
        }

        startNewGame(room);

        emitRoom(room);
      }
    );

    socket.on(
      'ready',
      (
        roomCode: string
      ) => {
        const room =
          rooms.get(roomCode);

        if (!room) {
          return;
        }

        if (
          room.status !==
          'focus'
        ) {
          return;
        }

        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          );

        if (!player) {
          return;
        }

        player.ready = true;

        const everyoneReady =
          room.players.every(
            (item) =>
              item.ready
          );

        if (
          everyoneReady
        ) {
          room.status =
            'playing';

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
        const room =
          rooms.get(code);

        if (!room) {
          return;
        }

        if (
          room.status !==
          'playing'
        ) {
          return;
        }

        /*
         * Não deixa jogar enquanto
         * existe votação de recurso.
         */
        if (
          room.resourceProposal
        ) {
          return;
        }

        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          );

        if (!player) {
          return;
        }

        /*
         * Só pode jogar a menor
         * carta da própria mão.
         */
        if (
          player.hand[0] !==
          value
        ) {
          return;
        }

        const lowerCards =
          room.players
            .flatMap(
              (item) =>
                item.hand
            )
            .filter(
              (card) =>
                card < value
            );

        player.hand.shift();

        if (
          lowerCards.length > 0
        ) {
          /*
           * Se Chance Dupla estiver
           * ativa, protege este erro.
           */
          if (
            room.doubleChanceActive
          ) {
            room.doubleChanceActive =
              false;

            restartLevelAfterMistake(
              room,
              true
            );

            emitRoom(room);

            return;
          }

          room.lives--;

          /*
           * Sem vidas:
           * partida inteira volta
           * para o nível 1.
           */
          if (
            room.lives <= 0
          ) {
            restartGameAfterLoss(
              room
            );

            emitRoom(room);

            return;
          }

          restartLevelAfterMistake(
            room
          );

          emitRoom(room);

          return;
        }

        room.pile.push(value);

        room.message =
          `${player.name} jogou ${value}.`;

        checkLevel(room);

        emitRoom(room);
      }
    );

    /*
     * JOGADOR PROPÕE
     * UMA CARTA ESPECIAL.
     */
    socket.on(
      'proposeResource',
      ({
        code,
        resource,
      }: {
        code: string;
        resource: ResourceType;
      }) => {
        const room =
          rooms.get(code);

        if (!room) {
          return;
        }

        if (
          room.status !==
          'playing'
        ) {
          return;
        }

        if (
          room.resourceProposal
        ) {
          socket.emit(
            'errorMessage',
            'Já existe uma votação de carta especial em andamento.'
          );

          return;
        }

        if (
          ![
            'star',
            'life',
            'double',
          ].includes(resource)
        ) {
          return;
        }

        if (
          !isResourceAvailable(
            room,
            resource
          )
        ) {
          return;
        }

        if (
          resource === 'double' &&
          room.doubleChanceActive
        ) {
          return;
        }

        if (
          resource === 'life'
        ) {
          const config =
            setupByPlayers(
              room.players.length
            );

          if (
            room.lives >=
            config.lives
          ) {
            socket.emit(
              'errorMessage',
              'A equipe já está com o máximo de vidas.'
            );

            return;
          }
        }

        resetVotes(room);

        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          );

        if (!player) {
          return;
        }

        room.resourceProposal =
          resource;

        /*
         * Quem propõe já vota SIM.
         */
        player.resourceVote =
          true;

        room.message =
          `${player.name} propôs usar ${resourceName(resource)}. Todos precisam confirmar.`;

        /*
         * Segurança para eventual
         * partida com apenas 1 jogador.
         */
        const everyoneVoted =
          room.players.every(
            (item) =>
              item.resourceVote
          );

        if (
          everyoneVoted
        ) {
          executeResource(
            room,
            resource
          );
        }

        emitRoom(room);
      }
    );

    /*
     * JOGADOR CONFIRMA
     * A PROPOSTA EXISTENTE.
     */
    socket.on(
      'voteResource',
      (
        roomCode: string
      ) => {
        const room =
          rooms.get(roomCode);

        if (!room) {
          return;
        }

        if (
          room.status !==
          'playing'
        ) {
          return;
        }

        const resource =
          room.resourceProposal;

        if (!resource) {
          return;
        }

        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          );

        if (!player) {
          return;
        }

        player.resourceVote =
          true;

        const everyoneVoted =
          room.players.every(
            (item) =>
              item.resourceVote
          );

        if (
          everyoneVoted
        ) {
          executeResource(
            room,
            resource
          );
        } else {
          const votes =
            room.players.filter(
              (item) =>
                item.resourceVote
            ).length;

          room.message =
            `${resourceName(resource)}: ${votes}/${room.players.length} jogadores confirmaram.`;
        }

        emitRoom(room);
      }
    );

    /*
     * QUALQUER JOGADOR PODE
     * CANCELAR A PROPOSTA.
     */
    socket.on(
      'cancelResource',
      (
        roomCode: string
      ) => {
        const room =
          rooms.get(roomCode);

        if (!room) {
          return;
        }

        if (
          !room.resourceProposal
        ) {
          return;
        }

        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          );

        const resource =
          room.resourceProposal;

        room.resourceProposal =
          null;

        resetVotes(room);

        room.message =
          `${player?.name || 'Um jogador'} cancelou o uso de ${resourceName(resource)}.`;

        emitRoom(room);
      }
    );

    socket.on(
      'disconnect',
      () => {
        console.log(
          `Jogador desconectado: ${socket.id}`
        );

        for (
          const [
            roomCode,
            room,
          ] of rooms
        ) {
          const previousCount =
            room.players.length;

          room.players =
            room.players.filter(
              (player) =>
                player.id !==
                socket.id
            );

          if (
            room.players.length ===
            previousCount
          ) {
            continue;
          }

          if (
            room.players.length === 0
          ) {
            rooms.delete(
              roomCode
            );

            continue;
          }

          if (
            room.hostId ===
            socket.id
          ) {
            room.hostId =
              room.players[0].id;
          }

          /*
           * Se alguém sair durante
           * votação, recalcula votos.
           */
          if (
            room.resourceProposal
          ) {
            const everyoneVoted =
              room.players.every(
                (player) =>
                  player.resourceVote
              );

            if (
              everyoneVoted
            ) {
              const resource =
                room.resourceProposal;

              executeResource(
                room,
                resource
              );
            }
          }

          emitRoom(room);
        }
      }
    );
  }
);

app.get(
  '/',
  (_, res) => {
    res.json({
      ok: true,
      service:
        'MindSync Server',
      message:
        'Servidor online',
    });
  }
);

app.get(
  '/health',
  (_, res) => {
    res.json({
      ok: true,
      service:
        'MindSync Server',
    });
  }
);

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