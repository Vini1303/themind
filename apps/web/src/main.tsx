import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  createRoot,
} from 'react-dom/client';

import {
  io,
} from 'socket.io-client';

import './styles.css';

const socket = io(
  import.meta.env.VITE_SERVER_URL ||
    'http://localhost:3001'
);

type ResourceType =
  | 'star'
  | 'life'
  | 'double';

type Player = {
  id: string;
  name: string;
  hand: number[];
  handCount: number;
  ready: boolean;
  resourceVote: boolean;
};

type Room = {
  code: string;
  hostId: string;

  players: Player[];

  level: number;
  maxLevel: number;

  lives: number;

  pile: number[];

  status: string;
  message: string;

  starCardAvailable: boolean;
  lifeCardAvailable: boolean;
  doubleChanceAvailable: boolean;

  doubleChanceActive: boolean;

  resourceProposal:
    ResourceType | null;
};

type PowerInfo = {
  type: ResourceType;
  symbol: string;
  title: string;
  shortTitle: string;
  description: string;
};

const POWERS: PowerInfo[] = [
  {
    type: 'star',
    symbol: '✦',
    title: 'Estrela Ninja',
    shortTitle: 'NINJA',
    description:
      'Remove a menor carta da mão de cada jogador. Todos precisam concordar antes do uso.',
  },
  {
    type: 'life',
    symbol: '♥',
    title: 'Vida Extra',
    shortTitle: 'VIDA',
    description:
      'Recupera 1 vida para a equipe. Só pode ser usada depois que uma vida tiver sido perdida.',
  },
  {
    type: 'double',
    symbol: '◈',
    title: 'Chance Dupla',
    shortTitle: 'CHANCE',
    description:
      'Protege a equipe contra o próximo erro. O nível recomeça, mas nenhuma vida é perdida.',
  },
];

function Tutorial({
  close,
}: {
  close: () => void;
}) {
  return (
    <div className="modal">
      <div className="sheet">
        <button
          className="x"
          onClick={close}
        >
          ×
        </button>

        <h2>Como jogar</h2>

        <p>
          Vocês são uma única
          equipe. O objetivo é
          jogar todas as cartas
          numéricas em ordem
          crescente, sem turnos e
          sem revelar os números.
        </p>

        <ol>
          <li>
            No nível 1, cada
            jogador recebe 1 carta.
            No nível 2, recebe 2, e
            assim por diante.
          </li>

          <li>
            Todos ficam prontos e
            então jogam sem turnos.
          </li>

          <li>
            Você só pode jogar a
            menor carta da sua
            própria mão.
          </li>

          <li>
            Se uma carta for jogada
            enquanto existir uma
            menor em qualquer mão,
            ocorre um erro.
          </li>

          <li>
            Normalmente um erro
            custa 1 vida e o nível
            inteiro recomeça com
            novas cartas.
          </li>

          <li>
            Se todas as vidas
            acabarem, a partida
            inteira volta para o
            nível 1.
          </li>

          <li>
            Cada partida começa com
            uma Estrela Ninja, uma
            Vida Extra e uma Chance
            Dupla.
          </li>

          <li>
            Qualquer carta especial
            só é usada depois que
            todos os jogadores
            confirmarem.
          </li>

          <li>
            A Chance Dupla protege
            contra o próximo erro:
            o nível recomeça sem
            perder vida.
          </li>

          <li>
            A equipe vence quando
            completar todos os
            níveis.
          </li>
        </ol>

        <p className="note">
          2 jogadores: 12 níveis e
          2 vidas.
          <br />

          3 jogadores: 10 níveis e
          3 vidas.
          <br />

          4 jogadores: 8 níveis e
          4 vidas.
        </p>

        <button onClick={close}>
          Entendi
        </button>
      </div>
    </div>
  );
}

function NumberCard({
  value,
  disabled,
  onClick,
}: {
  value: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="number-card"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Carta ${value}`}
    >
      <span className="card-corner card-corner-top">
        {value}
      </span>

      <div className="card-art">
        <span className="energy energy-one" />
        <span className="energy energy-two" />
        <span className="energy energy-three" />

        <span className="card-symbol">
          ✦
        </span>

        <strong>{value}</strong>
      </div>

      <span className="card-corner card-corner-bottom">
        {value}
      </span>

      <span className="card-action">
        {disabled
          ? 'AGUARDE'
          : 'TOQUE PARA JOGAR'}
      </span>
    </button>
  );
}

function PlayedCard({
  value,
}: {
  value?: number;
}) {
  if (
    value === undefined
  ) {
    return (
      <div className="played-card empty-played-card">
        <div className="empty-symbol">
          ◎
        </div>

        <small>
          AGUARDANDO
        </small>
      </div>
    );
  }

  return (
    <div className="played-card">
      <span className="played-corner played-top">
        {value}
      </span>

      <div className="played-art">
        <span className="played-energy played-energy-one" />
        <span className="played-energy played-energy-two" />

        <span>✦</span>

        <strong>
          {value}
        </strong>
      </div>

      <span className="played-corner played-bottom">
        {value}
      </span>
    </div>
  );
}

function DeckStack() {
  return (
    <div className="deck-area">
      <div className="deck-shadow" />

      <div className="deck-stack">
        <div className="deck-card deck-card-5" />
        <div className="deck-card deck-card-4" />
        <div className="deck-card deck-card-3" />
        <div className="deck-card deck-card-2" />

        <div className="deck-card deck-top">
          <div className="deck-pattern">
            <span className="deck-orbit orbit-one" />
            <span className="deck-orbit orbit-two" />

            <span className="deck-star">
              ✦
            </span>

            <strong>
              MIND
              <span>
                SYNC
              </span>
            </strong>

            <small>
              100
            </small>
          </div>
        </div>
      </div>

      <span className="table-label">
        BARALHO
      </span>
    </div>
  );
}

function LevelCard({
  level,
  maxLevel,
}: {
  level: number;
  maxLevel: number;
}) {
  return (
    <div className="level-area">
      <div className="level-card">
        <span>
          NÍVEL
        </span>

        <strong>
          {level}
        </strong>

        <small>
          DE {maxLevel}
        </small>
      </div>

      <span className="table-label">
        NÍVEL ATUAL
      </span>
    </div>
  );
}

function MiniPowerCard({
  power,
  available,
  active,
}: {
  power: PowerInfo;
  available: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={
        `mini-power-card power-${power.type}` +
        (!available
          ? ' power-used'
          : '') +
        (active
          ? ' power-active'
          : '')
      }
    >
      <span>
        {power.symbol}
      </span>

      <small>
        {power.shortTitle}
      </small>
    </div>
  );
}

function PowerModal({
  room,
  me,
  close,
}: {
  room: Room;
  me?: Player;
  close: () => void;
}) {
  const [
    selected,
    setSelected,
  ] = useState<ResourceType | null>(
    room.resourceProposal
  );

  useEffect(() => {
    if (
      room.resourceProposal
    ) {
      setSelected(
        room.resourceProposal
      );
    }
  }, [
    room.resourceProposal,
  ]);

  const availability = {
    star:
      room.starCardAvailable,

    life:
      room.lifeCardAvailable,

    double:
      room.doubleChanceAvailable,
  };

  const selectedPower =
    POWERS.find(
      (power) =>
        power.type === selected
    );

  const proposalPower =
    POWERS.find(
      (power) =>
        power.type ===
        room.resourceProposal
    );

  const votes =
    room.players.filter(
      (player) =>
        player.resourceVote
    ).length;

  const hasProposal =
    !!room.resourceProposal;

  const maxLives =
    room.players.length === 2
      ? 2
      : room.players.length === 3
        ? 3
        : 4;

  return (
    <div className="modal power-modal">
      <div className="power-sheet">
        <button
          className="power-close"
          onClick={close}
        >
          ×
        </button>

        <div className="power-modal-heading">
          <small>
            RECURSOS DA EQUIPE
          </small>

          <h2>
            Cartas Especiais
          </h2>

          <p>
            Escolha uma carta. O
            uso só acontece quando
            todos os jogadores
            confirmarem.
          </p>
        </div>

        <div className="power-grid">
          {POWERS.map(
            (power) => {
              const available =
                availability[
                  power.type
                ];

              const isSelected =
                selected ===
                power.type;

              const isActive =
                power.type ===
                  'double' &&
                room.doubleChanceActive;

              return (
                <button
                  key={
                    power.type
                  }
                  className={
                    `power-card-big power-${power.type}` +
                    (!available
                      ? ' power-used'
                      : '') +
                    (isSelected
                      ? ' selected'
                      : '') +
                    (isActive
                      ? ' power-active'
                      : '')
                  }
                  disabled={
                    !available ||
                    hasProposal
                  }
                  onClick={() =>
                    setSelected(
                      power.type
                    )
                  }
                >
                  <span className="power-card-symbol">
                    {
                      power.symbol
                    }
                  </span>

                  <strong>
                    {
                      power.title
                    }
                  </strong>

                  {isActive && (
                    <small className="active-label">
                      ATIVA
                    </small>
                  )}

                  {!available &&
                    !isActive && (
                      <small className="used-label">
                        USADA
                      </small>
                    )}
                </button>
              );
            }
          )}
        </div>

        {hasProposal &&
          proposalPower && (
            <div className="proposal-box">
              <span className="proposal-symbol">
                {
                  proposalPower.symbol
                }
              </span>

              <div>
                <small>
                  VOTAÇÃO EM
                  ANDAMENTO
                </small>

                <h3>
                  {
                    proposalPower.title
                  }
                </h3>

                <p>
                  {votes}/
                  {
                    room.players
                      .length
                  } jogadores
                  confirmaram.
                </p>
              </div>
            </div>
          )}

        {!hasProposal &&
          selectedPower && (
            <div className="power-description">
              <span>
                {
                  selectedPower.symbol
                }
              </span>

              <div>
                <h3>
                  {
                    selectedPower.title
                  }
                </h3>

                <p>
                  {
                    selectedPower.description
                  }
                </p>
              </div>
            </div>
          )}

        {!hasProposal &&
          selected ===
            'life' &&
          room.lives >=
            maxLives && (
            <div className="power-warning">
              A equipe já está com
              o máximo de vidas.
              Essa carta não pode
              ser usada agora.
            </div>
          )}

        <div className="power-modal-actions">
          {hasProposal ? (
            <>
              <button
                className="secondary-action"
                onClick={() =>
                  socket.emit(
                    'cancelResource',
                    room.code
                  )
                }
              >
                Cancelar votação
              </button>

              <button
                className="confirm-power"
                disabled={
                  !!me?.resourceVote
                }
                onClick={() =>
                  socket.emit(
                    'voteResource',
                    room.code
                  )
                }
              >
                {me?.resourceVote
                  ? 'Você já confirmou'
                  : 'Confirmar uso'}
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary-action"
                onClick={close}
              >
                Voltar
              </button>

              <button
                className="confirm-power"
                disabled={
                  !selected ||
                  (selected ===
                    'life' &&
                    room.lives >=
                      maxLives)
                }
                onClick={() => {
                  if (!selected) {
                    return;
                  }

                  socket.emit(
                    'proposeResource',
                    {
                      code:
                        room.code,
                      resource:
                        selected,
                    }
                  );
                }}
              >
                Propor uso
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [
    name,
    setName,
  ] = useState(
    localStorage.getItem(
      'name'
    ) || ''
  );

  const [
    joinCode,
    setJoinCode,
  ] = useState('');

  const [
    room,
    setRoom,
  ] =
    useState<Room | null>(
      null
    );

  const [
    tutorial,
    setTutorial,
  ] = useState(true);

  const [
    powerModal,
    setPowerModal,
  ] = useState(false);

  const [
    err,
    setErr,
  ] = useState('');

  useEffect(() => {
    const onRoom = (
      newRoom: Room
    ) => {
      setRoom(newRoom);
      setErr('');

      /*
       * Se uma votação terminou,
       * não fecha forçadamente:
       * o usuário pode visualizar
       * as sombras das cartas.
       */
    };

    const onError = (
      message: string
    ) => {
      setErr(message);
    };

    socket.on(
      'room',
      onRoom
    );

    socket.on(
      'errorMessage',
      onError
    );

    return () => {
      socket.off(
        'room',
        onRoom
      );

      socket.off(
        'errorMessage',
        onError
      );
    };
  }, []);

  const me = useMemo(
    () =>
      room?.players.find(
        (player) =>
          player.id ===
          socket.id
      ),
    [room]
  );

  const saveName = () => {
    localStorage.setItem(
      'name',
      name
    );
  };

  if (!room) {
    return (
      <main className="landing">
        <div className="landing-noise" />
        <div className="orb" />

        <section className="hero">
          <div className="eyebrow">
            JOGO COOPERATIVO DE
            SINCRONIA
          </div>

          <h1>
            Mind
            <span>
              Sync
            </span>
          </h1>

          <p>
            Entre no mesmo ritmo.
            Sem turnos. Sem números
            falados. Apenas timing.
          </p>

          <input
            placeholder="Seu nome"
            maxLength={18}
            value={name}
            onChange={(
              event
            ) =>
              setName(
                event.target
                  .value
              )
            }
            onBlur={
              saveName
            }
          />

          <button
            className="primary"
            disabled={
              !name.trim()
            }
            onClick={() => {
              saveName();

              socket.emit(
                'createRoom',
                {
                  name:
                    name.trim(),
                }
              );
            }}
          >
            Criar sala
          </button>

          <div className="join">
            <input
              placeholder="CÓDIGO"
              maxLength={6}
              value={
                joinCode
              }
              onChange={(
                event
              ) =>
                setJoinCode(
                  event.target
                    .value
                    .toUpperCase()
                )
              }
            />

            <button
              disabled={
                !name.trim() ||
                joinCode.length <
                  4
              }
              onClick={() => {
                saveName();

                socket.emit(
                  'joinRoom',
                  {
                    code:
                      joinCode
                        .trim()
                        .toUpperCase(),

                    name:
                      name.trim(),
                  }
                );
              }}
            >
              Entrar
            </button>
          </div>

          {err && (
            <div className="error">
              {err}
            </div>
          )}

          <button
            className="link"
            onClick={() =>
              setTutorial(
                true
              )
            }
          >
            Como jogar
          </button>
        </section>

        {tutorial && (
          <Tutorial
            close={() =>
              setTutorial(
                false
              )
            }
          />
        )}
      </main>
    );
  }

  const lastPlayed =
    room.pile.at(-1);

  const hasPower =
    room.starCardAvailable ||
    room.lifeCardAvailable ||
    room.doubleChanceAvailable;

  return (
    <main className="game">
      <header className="game-header">
        <div className="room-info">
          <small>
            SALA
          </small>

          <strong>
            {room.code}
          </strong>
        </div>

        <div className="stats">
          <span className="life-stat">
            ♥ {room.lives}
          </span>

          {room.doubleChanceActive && (
            <span className="double-active-stat">
              ◈ PROTEGIDO
            </span>
          )}

          <span className="level-stat">
            NÍVEL {room.level}/
            {room.maxLevel}
          </span>
        </div>

        <button
          className="ghost"
          onClick={() =>
            setTutorial(true)
          }
        >
          ?
        </button>
      </header>

      <section className="players">
        {room.players.map(
          (player) => (
            <div
              className={
                'player ' +
                (player.id ===
                socket.id
                  ? 'you'
                  : '')
              }
              key={
                player.id
              }
            >
              <span className="avatar">
                {player.name[0]?.toUpperCase()}
              </span>

              <div className="player-data">
                <b>
                  {
                    player.name
                  }

                  {player.id ===
                  room.hostId
                    ? ' 👑'
                    : ''}
                </b>

                <small>
                  {
                    player.handCount
                  }{' '}
                  carta(s)

                  {player.ready
                    ? ' • pronto'
                    : ''}

                  {player.resourceVote
                    ? ' • ✓ voto'
                    : ''}
                </small>
              </div>
            </div>
          )
        )}
      </section>

      <section className="board">
        <div className="table-glow" />

        <div className="status">
          {room.message}
        </div>

        {(room.status ===
          'playing' ||
          room.status ===
            'focus') && (
          <button
            className={
              'power-dock' +
              (!hasPower &&
              !room.resourceProposal
                ? ' dock-empty'
                : '')
            }
            disabled={
              !hasPower &&
              !room.resourceProposal
            }
            onClick={() =>
              setPowerModal(
                true
              )
            }
            aria-label="Abrir cartas especiais"
          >
            <MiniPowerCard
              power={
                POWERS[0]
              }
              available={
                room.starCardAvailable
              }
            />

            <MiniPowerCard
              power={
                POWERS[1]
              }
              available={
                room.lifeCardAvailable
              }
            />

            <MiniPowerCard
              power={
                POWERS[2]
              }
              available={
                room.doubleChanceAvailable
              }
              active={
                room.doubleChanceActive
              }
            />
          </button>
        )}

        {room.doubleChanceActive && (
          <div className="double-protection-banner">
            <span>
              ◈
            </span>

            <div>
              <strong>
                CHANCE DUPLA ATIVA
              </strong>

              <small>
                O próximo erro não
                custará uma vida
              </small>
            </div>
          </div>
        )}

        <div className="physical-table">
          <LevelCard
            level={room.level}
            maxLevel={
              room.maxLevel
            }
          />

          <div className="discard-area">
            <div className="discard-under discard-under-1" />
            <div className="discard-under discard-under-2" />

            <PlayedCard
              value={
                lastPlayed
              }
            />

            <span className="table-label">
              PILHA JOGADA
            </span>
          </div>

          <DeckStack />
        </div>

        {room.status ===
          'lobby' && (
          <div className="panel">
            <h2>
              Sala criada
            </h2>

            <p>
              Compartilhe o
              código{' '}
              <b>
                {room.code}
              </b>
              .
              <br />

              Quando houver de
              2 a 4 jogadores,
              o anfitrião
              poderá iniciar.
            </p>

            {room.hostId ===
              socket.id && (
              <button
                className="primary"
                disabled={
                  room.players
                    .length < 2
                }
                onClick={() =>
                  socket.emit(
                    'start',
                    room.code
                  )
                }
              >
                Iniciar partida
              </button>
            )}
          </div>
        )}

        {room.status ===
          'focus' && (
          <div className="panel focus">
            <div className="pulse">
              ◎
            </div>

            <h2>
              Sincronizem
            </h2>

            <p>
              Observe suas
              cartas. Quando
              estiver preparado,
              marque como pronto.
            </p>

            <button
              className="primary"
              disabled={
                !!me?.ready
              }
              onClick={() =>
                socket.emit(
                  'ready',
                  room.code
                )
              }
            >
              {me?.ready
                ? 'Aguardando os outros...'
                : 'Estou pronto'}
            </button>
          </div>
        )}

        {room.status ===
          'playing' && (
          <>
            <div className="hand-section">
              <div className="hand-title">
                <span>
                  SUA MÃO
                </span>

                <small>
                  {me?.hand
                    .length ||
                    0}{' '}
                  carta(s)
                </small>
              </div>

              <div className="hand">
                {me?.hand.map(
                  (
                    value,
                    index
                  ) => (
                    <NumberCard
                      key={
                        value
                      }
                      value={
                        value
                      }
                      disabled={
                        index !==
                          0 ||
                        !!room.resourceProposal
                      }
                      onClick={() =>
                        socket.emit(
                          'play',
                          {
                            code:
                              room.code,
                            value,
                          }
                        )
                      }
                    />
                  )
                )}
              </div>
            </div>

            <div className="special-action-mobile">
              <button
                disabled={
                  !hasPower &&
                  !room.resourceProposal
                }
                onClick={() =>
                  setPowerModal(
                    true
                  )
                }
              >
                ✦ ♥ ◈ Cartas
                especiais
              </button>
            </div>
          </>
        )}

        {(room.status ===
          'won' ||
          room.status ===
            'lost') && (
          <div className="panel result-panel">
            <h2>
              {room.status ===
              'won'
                ? 'Vocês conseguiram!'
                : 'Fim de jogo'}
            </h2>

            <p>
              {room.message}
            </p>

            {room.hostId ===
              socket.id && (
              <button
                className="primary"
                onClick={() =>
                  socket.emit(
                    'start',
                    room.code
                  )
                }
              >
                Jogar novamente
              </button>
            )}
          </div>
        )}
      </section>

      {tutorial && (
        <Tutorial
          close={() =>
            setTutorial(false)
          }
        />
      )}

      {powerModal && (
        <PowerModal
          room={room}
          me={me}
          close={() =>
            setPowerModal(
              false
            )
          }
        />
      )}
    </main>
  );
}

createRoot(
  document.getElementById(
    'root'
  )!
).render(<App />);