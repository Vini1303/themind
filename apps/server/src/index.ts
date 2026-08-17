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

type ResourceType =
  | 'star'
  | 'life'
  | 'double';

type RoomStatus =
  | 'lobby'
  | 'focus'
  | 'playing'
  | 'won';

type Player = {
  id: string;
  name: string;
  hand: number[];
  ready: boolean;
  resourceVote: boolean;
};

type Spectator = {
  id: string;
  name: string;
  joinedAt: number;
};

type Room = {
  code: string;
  hostId: string;

  players: Player[];
  spectators: Spectator[];

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

  resourceProposal:
    ResourceType | null;
};

const rooms =
  new Map<string, Room>();

function generateRoomCode() {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  return Array.from(
    { length: 5 },
    () =>
      chars[
        Math.floor(
          Math.random() *
            chars.length
        )
      ]
  ).join('');
}

function setupByPlayers(
  playerCount: number
) {
  if (playerCount <= 2) {
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

function shuffle<T>(
  array: T[]
) {
  const result = [...array];

  for (
    let i =
      result.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}

function resetVotes(
  room: Room
) {
  room.players.forEach(
    (player) => {
      player.resourceVote =
        false;
    }
  );
}

function publicRoomForPlayer(
  room: Room,
  viewerId: string
) {
  return {
    ...room,

    viewerRole:
      'player' as const,

    queuePosition: null,

    players:
      room.players.map(
        (player) => ({
          ...player,

          hand:
            player.id ===
            viewerId
              ? player.hand
              : [],

          handCount:
            player.hand.length,
        })
      ),

    spectators:
      room.spectators.map(
        (spectator) => ({
          id: spectator.id,
          name: spectator.name,
        })
      ),
  };
}

function publicRoomForSpectator(
  room: Room,
  spectatorId: string
) {
  const index =
    room.spectators.findIndex(
      (spectator) =>
        spectator.id ===
        spectatorId
    );

  return {
    ...room,

    /*
     * Espectador recebe as
     * mãos abertas para poder
     * acompanhar a partida.
     */
    players:
      room.players.map(
        (player) => ({
          ...player,

          hand: player.hand,

          handCount:
            player.hand.length,
        })
      ),

    spectators:
      room.spectators.map(
        (spectator) => ({
          id: spectator.id,
          name: spectator.name,
        })
      ),

    viewerRole:
      'spectator' as const,

    queuePosition:
      index >= 0
        ? index + 1
        : null,
  };
}

function emitRoom(
  room: Room
) {
  room.players.forEach(
    (player) => {
      io.to(player.id).emit(
        'room',
        publicRoomForPlayer(
          room,
          player.id
        )
      );
    }
  );

  room.spectators.forEach(
    (spectator) => {
      io.to(
        spectator.id
      ).emit(
        'room',
        publicRoomForSpectator(
          room,
          spectator.id
        )
      );
    }
  );
}

function deal(
  room: Room
) {
  if (
    room.players.length === 0
  ) {
    return;
  }

  const config =
    setupByPlayers(
      room.players.length
    );

  room.maxLevel =
    config.maxLevel;

  const deck = shuffle(
    Array.from(
      { length: 100 },
      (_, index) =>
        index + 1
    )
  );

  room.players.forEach(
    (player) => {
      player.hand =
        deck
          .splice(
            0,
            room.level
          )
          .sort(
            (a, b) =>
              a - b
          );

      player.ready = false;

      player.resourceVote =
        false;
    }
  );

  room.pile = [];

  room.resourceProposal =
    null;

  room.status = 'focus';

  room.message =
    `Nível ${room.level}: todos precisam ficar prontos.`;
}

function promoteSpectators(
  room: Room
) {
  while (
    room.players.length < 4 &&
    room.spectators.length > 0
  ) {
    const spectator =
      room.spectators.shift();

    if (!spectator) {
      break;
    }

    room.players.push({
      id: spectator.id,
      name: spectator.name,
      hand: [],
      ready: false,
      resourceVote: false,
    });
  }

  if (
    room.players.length > 0 &&
    !room.players.some(
      (player) =>
        player.id ===
        room.hostId
    )
  ) {
    room.hostId =
      room.players[0].id;
  }
}

function startNewGame(
  room: Room,
  promoteQueue = true
) {
  if (promoteQueue) {
    promoteSpectators(room);
  }

  const config =
    setupByPlayers(
      room.players.length
    );

  room.level = 1;

  room.maxLevel =
    config.maxLevel;

  room.lives =
    config.lives;

  room.starCardAvailable =
    true;

  room.lifeCardAvailable =
    true;

  room.doubleChanceAvailable =
    true;

  room.doubleChanceActive =
    false;

  room.resourceProposal =
    null;

  resetVotes(room);

  deal(room);
}

function restartAfterLoss(
  room: Room
) {
  const waitingBefore =
    room.spectators.length;

  startNewGame(
    room,
    true
  );

  const entered =
    waitingBefore -
    room.spectators.length;

  room.message =
    entered > 0
      ? `A equipe perdeu todas as vidas. Nova partida no nível 1. ${entered} jogador(es) da fila entraram automaticamente.`
      : 'A equipe perdeu todas as vidas. Nova partida iniciada no nível 1.';
}

function startAfterVictory(
  room: Room
) {
  const waitingBefore =
    room.spectators.length;

  startNewGame(
    room,
    true
  );

  const entered =
    waitingBefore -
    room.spectators.length;

  room.message =
    entered > 0
      ? `Partida concluída! Nova partida iniciada no nível 1 com ${entered} jogador(es) da fila.`
      : 'Partida concluída! Uma nova partida começou no nível 1.';
}

function restartLevelAfterMistake(
  room: Room,
  protectedByDoubleChance =
    false
) {
  deal(room);

  if (
    protectedByDoubleChance
  ) {
    room.message =
      `◈ Chance Dupla protegeu a equipe! Nenhuma vida foi perdida. O nível ${room.level} recomeçou.`;

    return;
  }

  room.message =
    `Erro! A equipe perdeu 1 vida. O nível ${room.level} recomeçou desde o início.`;
}

function checkLevel(
  room: Room
) {
  const everyoneFinished =
    room.players.every(
      (player) =>
        player.hand.length ===
        0
    );

  if (!everyoneFinished) {
    return;
  }

  /*
   * Terminou o último nível.
   * Em vez de deixar a sala
   * parada, começa a próxima
   * partida no nível 1 e coloca
   * a fila automaticamente.
   */
  if (
    room.level >=
    room.maxLevel
  ) {
    startAfterVictory(room);
    return;
  }

  room.level++;

  deal(room);
}

function resourceName(
  resource: ResourceType
) {
  if (
    resource === 'star'
  ) {
    return 'Estrela Ninja';
  }

  if (
    resource === 'life'
  ) {
    return 'Vida Extra';
  }

  return 'Chance Dupla';
}

function isResourceAvailable(
  room: Room,
  resource: ResourceType
) {
  if (
    resource === 'star'
  ) {
    return (
      room.starCardAvailable
    );
  }

  if (
    resource === 'life'
  ) {
    return (
      room.lifeCardAvailable
    );
  }

  return (
    room.doubleChanceAvailable
  );
}

function executeResource(
  room: Room,
  resource: ResourceType
) {
  room.resourceProposal =
    null;

  resetVotes(room);

  if (
    resource === 'star'
  ) {
    if (
      !room.starCardAvailable
    ) {
      return;
    }

    room.starCardAvailable =
      false;

    const discarded:
      number[] = [];

    room.players.forEach(
      (player) => {
        if (
          player.hand.length ===
          0
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
      (a, b) =>
        a - b
    );

    room.message =
      discarded.length > 0
        ? `✦ Estrela Ninja usada. Menores cartas removidas: ${discarded.join(', ')}.`
        : '✦ Estrela Ninja usada.';

    checkLevel(room);

    return;
  }

  if (
    resource === 'life'
  ) {
    if (
      !room.lifeCardAvailable
    ) {
      return;
    }

    const config =
      setupByPlayers(
        room.players.length
      );

    if (
      room.lives >=
      config.lives
    ) {
      room.message =
        '♥ A equipe já está com o máximo de vidas.';

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
    '◈ Chance Dupla ativada! O próximo erro não fará perder uma vida.';
}

function removeFromRoom(
  room: Room,
  socketId: string
) {
  const playerIndex =
    room.players.findIndex(
      (player) =>
        player.id ===
        socketId
    );

  const spectatorIndex =
    room.spectators.findIndex(
      (spectator) =>
        spectator.id ===
        socketId
    );

  if (
    playerIndex >= 0
  ) {
    room.players.splice(
      playerIndex,
      1
    );
  }

  if (
    spectatorIndex >= 0
  ) {
    room.spectators.splice(
      spectatorIndex,
      1
    );
  }

  if (
    room.hostId ===
    socketId
  ) {
    if (
      room.players.length >
      0
    ) {
      room.hostId =
        room.players[0].id;
    } else {
      room.hostId = '';
    }
  }

  return (
    playerIndex >= 0 ||
    spectatorIndex >= 0
  );
}

function findRoomBySocket(
  socketId: string
) {
  for (
    const room of
    rooms.values()
  ) {
    const isPlayer =
      room.players.some(
        (player) =>
          player.id ===
          socketId
      );

    const isSpectator =
      room.spectators.some(
        (spectator) =>
          spectator.id ===
          socketId
      );

    if (
      isPlayer ||
      isSpectator
    ) {
      return room;
    }
  }

  return undefined;
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
        /*
         * Caso o jogador já
         * estivesse em outra sala.
         */
        const oldRoom =
          findRoomBySocket(
            socket.id
          );

        if (oldRoom) {
          removeFromRoom(
            oldRoom,
            socket.id
          );

          if (
            oldRoom.players
              .length === 0 &&
            oldRoom.spectators
              .length === 0
          ) {
            rooms.delete(
              oldRoom.code
            );
          } else {
            emitRoom(oldRoom);
          }
        }

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

          spectators: [],

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

        const oldRoom =
          findRoomBySocket(
            socket.id
          );

        if (
          oldRoom &&
          oldRoom.code !==
            room.code
        ) {
          removeFromRoom(
            oldRoom,
            socket.id
          );

          emitRoom(oldRoom);
        }

        const alreadyPlayer =
          room.players.find(
            (player) =>
              player.id ===
              socket.id
          );

        const alreadySpectator =
          room.spectators.find(
            (spectator) =>
              spectator.id ===
              socket.id
          );

        if (
          alreadyPlayer ||
          alreadySpectator
        ) {
          emitRoom(room);
          return;
        }

        /*
         * Se ainda está no lobby
         * e há vaga, entra direto.
         */
        if (
          room.status ===
            'lobby' &&
          room.players.length <
            4
        ) {
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

          return;
        }

        /*
         * Partida já começou:
         * entra como espectador
         * na fila.
         */
        room.spectators.push({
          id: socket.id,

          name:
            name ||
            'Espectador',

          joinedAt:
            Date.now(),
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
          room.status !==
          'lobby'
        ) {
          return;
        }

        if (
          room.players.length <
          2
        ) {
          socket.emit(
            'errorMessage',
            'São necessários pelo menos 2 jogadores.'
          );

          return;
        }

        /*
         * Pessoas que estavam na
         * fila antes de começar
         * podem entrar se houver
         * vaga.
         */
        promoteSpectators(room);

        startNewGame(
          room,
          false
        );

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

        /*
         * Espectadores não
         * conseguem jogar.
         */
        if (!player) {
          return;
        }

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

          if (
            room.lives <= 0
          ) {
            restartAfterLoss(
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

        /*
         * Apenas jogadores ativos.
         */
        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          );

        if (!player) {
          return;
        }

        if (
          room.resourceProposal
        ) {
          socket.emit(
            'errorMessage',
            'Já existe uma votação em andamento.'
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
          resource ===
            'double' &&
          room.doubleChanceActive
        ) {
          return;
        }

        if (
          resource === 'life'
        ) {
          const config =
            setupByPlayers(
              room.players
                .length
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

        room.resourceProposal =
          resource;

        player.resourceVote =
          true;

        room.message =
          `${player.name} propôs usar ${resourceName(resource)}. Todos precisam confirmar.`;

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

        if (!player) {
          return;
        }

        const resource =
          room.resourceProposal;

        room.resourceProposal =
          null;

        resetVotes(room);

        room.message =
          `${player.name} cancelou o uso de ${resourceName(resource)}.`;

        emitRoom(room);
      }
    );

    /*
     * BOTÃO SAIR DA SALA
     */
    socket.on(
      'leaveRoom',
      (
        roomCode: string
      ) => {
        const room =
          rooms.get(roomCode);

        if (!room) {
          socket.emit(
            'leftRoom'
          );

          return;
        }

        const removed =
          removeFromRoom(
            room,
            socket.id
          );

        socket.emit(
          'leftRoom'
        );

        if (!removed) {
          return;
        }

        /*
         * Sala completamente vazia.
         */
        if (
          room.players.length ===
            0 &&
          room.spectators.length ===
            0
        ) {
          rooms.delete(
            room.code
          );

          return;
        }

        /*
         * Se todos os jogadores
         * ativos saíram mas ainda
         * existem espectadores,
         * transforma a fila em
         * jogadores e cria uma
         * nova partida.
         */
        if (
          room.players.length ===
            0 &&
          room.spectators.length >
            0
        ) {
          promoteSpectators(
            room
          );

          if (
            room.players.length >
            0
          ) {
            room.hostId =
              room.players[0].id;
          }

          if (
            room.players.length >=
            2
          ) {
            startNewGame(
              room,
              false
            );

            room.message =
              'Os jogadores anteriores saíram. Uma nova partida foi preparada.';
          } else {
            room.status =
              'lobby';

            room.message =
              'Aguardando mais jogadores.';
          }

          emitRoom(room);

          return;
        }

        /*
         * Se uma pessoa sair no
         * meio da partida, não
         * puxa alguém da fila
         * imediatamente.
         *
         * A fila só entra no
         * começo da próxima
         * partida, como pedido.
         */
        room.message =
          room.status ===
          'lobby'
            ? 'Um jogador saiu da sala.'
            : 'Um jogador saiu da partida. A fila entrará somente na próxima partida.';

        /*
         * Caso só reste um jogador,
         * ele ainda pode assistir
         * o estado atual. A próxima
         * partida só seguirá quando
         * houver jogadores suficientes.
         */
        emitRoom(room);
      }
    );

    socket.on(
      'disconnect',
      () => {
        console.log(
          `Jogador desconectado: ${socket.id}`
        );

        const room =
          findRoomBySocket(
            socket.id
          );

        if (!room) {
          return;
        }

        removeFromRoom(
          room,
          socket.id
        );

        if (
          room.players.length ===
            0 &&
          room.spectators.length ===
            0
        ) {
          rooms.delete(
            room.code
          );

          return;
        }

        if (
          room.players.length ===
            0 &&
          room.spectators.length >
            0
        ) {
          promoteSpectators(
            room
          );

          if (
            room.players.length >
            0
          ) {
            room.hostId =
              room.players[0].id;
          }

          if (
            room.players.length >=
            2
          ) {
            startNewGame(
              room,
              false
            );
          } else {
            room.status =
              'lobby';
          }
        }

        /*
         * Se havia votação e um
         * jogador saiu, verifica
         * se todos os restantes
         * já votaram.
         */
        if (
          room.resourceProposal &&
          room.players.length > 0
        ) {
          const everyoneVoted =
            room.players.every(
              (player) =>
                player.resourceVote
            );

          if (
            everyoneVoted
          ) {
            executeResource(
              room,
              room.resourceProposal
            );
          }
        }

        emitRoom(room);
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