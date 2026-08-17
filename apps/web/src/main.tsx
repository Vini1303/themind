import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './styles.css';

const socket = io(
  import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
);

type Player = {
  id: string;
  name: string;
  hand: number[];
  handCount: number;
  ready: boolean;
  starVote: boolean;
};

type Room = {
  code: string;
  hostId: string;
  players: Player[];
  level: number;
  maxLevel: number;
  lives: number;
  stars: number;
  pile: number[];
  status: string;
  message: string;
};

function Tutorial({ close }: { close: () => void }) {
  return (
    <div className="modal">
      <div className="sheet">
        <button className="x" onClick={close}>
          ×
        </button>

        <h2>Como jogar</h2>

        <p>
          Vocês são uma única equipe. O objetivo é jogar todas as cartas
          numéricas em ordem crescente, sem turnos e sem revelar os números
          das suas cartas.
        </p>

        <ol>
          <li>
            No nível 1, cada jogador recebe 1 carta. No nível 2, recebe 2
            cartas, e assim por diante.
          </li>

          <li>
            Quando todos estiverem prontos, a rodada começa. Quem acreditar
            que possui a menor carta disponível deve jogá-la.
          </li>

          <li>
            Você sempre deve jogar primeiro a menor carta da sua própria mão.
          </li>

          <li>
            Se alguém jogar uma carta enquanto existir uma carta menor na mão
            de qualquer jogador, a equipe perde 1 vida e o mesmo nível
            recomeça do zero, com novas cartas.
          </li>

          <li>
            Se a equipe perder todas as vidas, a partida inteira recomeça no
            nível 1, com 1 carta para cada jogador.
          </li>

          <li>
            Uma estrela pode ser proposta. Se todos concordarem, cada jogador
            descarta a menor carta da própria mão e a equipe gasta 1 estrela.
          </li>

          <li>
            Ao esvaziar todas as mãos, vocês avançam para o próximo nível.
          </li>

          <li>
            Alguns níveis concedem vidas ou estrelas extras.
          </li>

          <li>
            A equipe vence ao completar todos os níveis.
          </li>
        </ol>

        <p className="note">
          2 jogadores: 12 níveis e 2 vidas.
          <br />
          3 jogadores: 10 níveis e 3 vidas.
          <br />
          4 jogadores: 8 níveis e 4 vidas.
          <br />
          Todos começam com 1 estrela.
        </p>

        <button onClick={close}>Entendi</button>
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
      <span className="card-corner card-corner-top">{value}</span>

      <div className="card-art">
        <span className="energy energy-one" />
        <span className="energy energy-two" />
        <span className="energy energy-three" />

        <span className="card-symbol">✦</span>

        <strong>{value}</strong>
      </div>

      <span className="card-corner card-corner-bottom">{value}</span>

      <span className="card-action">
        {disabled ? 'AGUARDE' : 'TOQUE PARA JOGAR'}
      </span>
    </button>
  );
}

function PlayedCard({ value }: { value?: number }) {
  if (value === undefined) {
    return (
      <div className="played-card empty-played-card">
        <div className="empty-symbol">◎</div>
        <small>AGUARDANDO</small>
      </div>
    );
  }

  return (
    <div className="played-card">
      <span className="played-corner played-top">{value}</span>

      <div className="played-art">
        <span className="played-energy played-energy-one" />
        <span className="played-energy played-energy-two" />

        <span>✦</span>
        <strong>{value}</strong>
      </div>

      <span className="played-corner played-bottom">{value}</span>
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
            <span className="deck-star">✦</span>

            <strong>
              MIND
              <span>SYNC</span>
            </strong>

            <small>100</small>
          </div>
        </div>
      </div>

      <span className="table-label">BARALHO</span>
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
        <span>NÍVEL</span>
        <strong>{level}</strong>
        <small>DE {maxLevel}</small>
      </div>

      <span className="table-label">NÍVEL ATUAL</span>
    </div>
  );
}

function App() {
  const [name, setName] = useState(
    localStorage.getItem('name') || ''
  );

  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [tutorial, setTutorial] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onRoom = (r: Room) => {
      setRoom(r);
      setErr('');
    };

    const onError = (message: string) => {
      setErr(message);
    };

    socket.on('room', onRoom);
    socket.on('errorMessage', onError);

    return () => {
      socket.off('room', onRoom);
      socket.off('errorMessage', onError);
    };
  }, []);

  const me = useMemo(
    () => room?.players.find((player) => player.id === socket.id),
    [room]
  );

  const saveName = () => {
    localStorage.setItem('name', name);
  };

  if (!room) {
    return (
      <main className="landing">
        <div className="landing-noise" />
        <div className="orb" />

        <section className="hero">
          <div className="eyebrow">
            JOGO COOPERATIVO DE SINCRONIA
          </div>

          <h1>
            Mind<span>Sync</span>
          </h1>

          <p>
            Entre no mesmo ritmo. Sem turnos. Sem números falados.
            Apenas timing.
          </p>

          <input
            placeholder="Seu nome"
            maxLength={18}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
          />

          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => {
              saveName();

              socket.emit('createRoom', {
                name: name.trim(),
              });
            }}
          >
            Criar sala
          </button>

          <div className="join">
            <input
              placeholder="CÓDIGO"
              maxLength={6}
              value={joinCode}
              onChange={(event) =>
                setJoinCode(event.target.value.toUpperCase())
              }
            />

            <button
              disabled={!name.trim() || joinCode.length < 4}
              onClick={() => {
                saveName();

                socket.emit('joinRoom', {
                  code: joinCode.trim().toUpperCase(),
                  name: name.trim(),
                });
              }}
            >
              Entrar
            </button>
          </div>

          {err && <div className="error">{err}</div>}

          <button
            className="link"
            onClick={() => setTutorial(true)}
          >
            Como jogar
          </button>
        </section>

        {tutorial && (
          <Tutorial close={() => setTutorial(false)} />
        )}
      </main>
    );
  }

  const lastPlayed = room.pile.at(-1);

  return (
    <main className="game">
      <header className="game-header">
        <div className="room-info">
          <small>SALA</small>
          <strong>{room.code}</strong>
        </div>

        <div className="stats">
          <span className="life-stat">
            ♥ {room.lives}
          </span>

          <span className="star-stat">
            ✦ {room.stars}
          </span>

          <span className="level-stat">
            NÍVEL {room.level}/{room.maxLevel}
          </span>
        </div>

        <button
          className="ghost"
          onClick={() => setTutorial(true)}
        >
          ?
        </button>
      </header>

      <section className="players">
        {room.players.map((player) => (
          <div
            className={
              'player ' +
              (player.id === socket.id ? 'you' : '')
            }
            key={player.id}
          >
            <span className="avatar">
              {player.name[0]?.toUpperCase()}
            </span>

            <div className="player-data">
              <b>
                {player.name}
                {player.id === room.hostId ? ' 👑' : ''}
              </b>

              <small>
                {player.handCount} carta(s)
                {player.ready ? ' • pronto' : ''}
                {player.starVote ? ' • ✦ sim' : ''}
              </small>
            </div>
          </div>
        ))}
      </section>

      <section className="board">
        <div className="table-glow" />

        <div className="status">
          {room.message}
        </div>

        <div className="physical-table">
          <LevelCard
            level={room.level}
            maxLevel={room.maxLevel}
          />

          <div className="discard-area">
            <div className="discard-under discard-under-1" />
            <div className="discard-under discard-under-2" />

            <PlayedCard value={lastPlayed} />

            <span className="table-label">
              PILHA JOGADA
            </span>
          </div>

          <DeckStack />
        </div>

        {room.status === 'lobby' && (
          <div className="panel">
            <h2>Sala criada</h2>

            <p>
              Compartilhe o código{' '}
              <b>{room.code}</b>.
              <br />
              Quando houver de 2 a 4 jogadores, o anfitrião
              poderá iniciar.
            </p>

            {room.hostId === socket.id && (
              <button
                className="primary"
                disabled={room.players.length < 2}
                onClick={() =>
                  socket.emit('start', room.code)
                }
              >
                Iniciar partida
              </button>
            )}
          </div>
        )}

        {room.status === 'focus' && (
          <div className="panel focus">
            <div className="pulse">◎</div>

            <h2>Sincronizem</h2>

            <p>
              Observe suas cartas. Respire, analise seus números
              e marque quando estiver preparado.
            </p>

            <button
              className="primary"
              disabled={!!me?.ready}
              onClick={() =>
                socket.emit('ready', room.code)
              }
            >
              {me?.ready
                ? 'Aguardando os outros...'
                : 'Estou pronto'}
            </button>
          </div>
        )}

        {room.status === 'playing' && (
          <>
            <div className="hand-section">
              <div className="hand-title">
                <span>SUA MÃO</span>
                <small>
                  {me?.hand.length || 0} carta(s)
                </small>
              </div>

              <div className="hand">
                {me?.hand.map((value, index) => (
                  <NumberCard
                    key={value}
                    value={value}
                    disabled={index !== 0}
                    onClick={() =>
                      socket.emit('play', {
                        code: room.code,
                        value,
                      })
                    }
                  />
                ))}
              </div>
            </div>

            <div className="actions">
              <button
                disabled={room.stars < 1}
                onClick={() =>
                  socket.emit(
                    me?.starVote
                      ? 'voteStar'
                      : 'proposeStar',
                    room.code
                  )
                }
              >
                ✦{' '}
                {me?.starVote
                  ? 'Confirmar estrela'
                  : 'Propor estrela'}
              </button>
            </div>
          </>
        )}

        {(room.status === 'won' ||
          room.status === 'lost') && (
          <div className="panel result-panel">
            <h2>
              {room.status === 'won'
                ? 'Vocês conseguiram!'
                : 'Fim de jogo'}
            </h2>

            <p>{room.message}</p>

            {room.hostId === socket.id && (
              <button
                className="primary"
                onClick={() =>
                  socket.emit('start', room.code)
                }
              >
                Jogar novamente
              </button>
            )}
          </div>
        )}
      </section>

      {tutorial && (
        <Tutorial close={() => setTutorial(false)} />
      )}
    </main>
  );
}

createRoot(
  document.getElementById('root')!
).render(<App />);