import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

type Player = { id:string; name:string; hand:number[]; ready:boolean; starVote:boolean };
type Room = { code:string; hostId:string; players:Player[]; level:number; maxLevel:number; lives:number; stars:number; pile:number[]; status:'lobby'|'focus'|'playing'|'won'|'lost'; message:string };
const rooms = new Map<string, Room>();
const rewardMap: Record<number, 'life'|'star'> = {2:'star',3:'life',5:'star',6:'life',8:'star',9:'life'};

function code(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({length:5},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }
function setupByPlayers(n:number){ return n===2?{maxLevel:12,lives:2}:n===3?{maxLevel:10,lives:3}:{maxLevel:8,lives:4}; }
function shuffle<T>(a:T[]){ const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; }
function publicRoom(r:Room, viewer:string){ return {...r, players:r.players.map(p=>({...p, hand:p.id===viewer?p.hand:[], handCount:p.hand.length}))}; }
function emitRoom(r:Room){ r.players.forEach(p=>io.to(p.id).emit('room', publicRoom(r,p.id))); }
function deal(r:Room){
  const cfg=setupByPlayers(r.players.length); r.maxLevel=cfg.maxLevel;
  const deck=shuffle(Array.from({length:100},(_,i)=>i+1));
  r.players.forEach(p=>{p.hand=deck.splice(0,r.level).sort((a,b)=>a-b); p.ready=false; p.starVote=false;});
  r.pile=[]; r.status='focus'; r.message=`Nível ${r.level}: todos precisam ficar prontos.`;
}
function checkLevel(r:Room){
  if(r.players.every(p=>p.hand.length===0)){
    const reward=rewardMap[r.level];
    if(reward==='life') r.lives=Math.min(5,r.lives+1);
    if(reward==='star') r.stars=Math.min(3,r.stars+1);
    if(r.level>=r.maxLevel){ r.status='won'; r.message='Sincronia completa! A equipe venceu.'; }
    else { r.level++; deal(r); }
  }
}

io.on('connection', socket=>{
  socket.on('createRoom', ({name}:{name:string})=>{
    let c=code(); while(rooms.has(c)) c=code();
    const r:Room={code:c,hostId:socket.id,players:[{id:socket.id,name:name||'Jogador',hand:[],ready:false,starVote:false}],level:1,maxLevel:12,lives:2,stars:1,pile:[],status:'lobby',message:'Convide seus amigos pelo código.'};
    rooms.set(c,r); emitRoom(r);
  });
  socket.on('joinRoom', ({code:raw,name}:{code:string;name:string})=>{
    const c=(raw||'').toUpperCase(); const r=rooms.get(c);
    if(!r) return socket.emit('errorMessage','Sala não encontrada.');
    if(r.status!=='lobby') return socket.emit('errorMessage','A partida já começou.');
    if(r.players.length>=4) return socket.emit('errorMessage','Sala cheia (máximo 4).');
    r.players.push({id:socket.id,name:name||'Jogador',hand:[],ready:false,starVote:false}); emitRoom(r);
  });
  socket.on('start', (c:string)=>{
    const r=rooms.get(c); if(!r||r.hostId!==socket.id) return;
    if(r.players.length<2) return socket.emit('errorMessage','São necessários pelo menos 2 jogadores.');
    const cfg=setupByPlayers(r.players.length); r.lives=cfg.lives; r.maxLevel=cfg.maxLevel; r.level=1; r.stars=1; deal(r); emitRoom(r);
  });
  socket.on('ready', (c:string)=>{
    const r=rooms.get(c); if(!r||r.status!=='focus') return;
    const p=r.players.find(x=>x.id===socket.id); if(!p) return; p.ready=true;
    if(r.players.every(x=>x.ready)){ r.status='playing'; r.message='Joguem sem turnos e sem revelar números.'; }
    emitRoom(r);
  });
  socket.on('play', ({code:c,value}:{code:string;value:number})=>{
    const r=rooms.get(c); if(!r||r.status!=='playing') return;
    const p=r.players.find(x=>x.id===socket.id); if(!p||p.hand[0]!==value) return;
    const lower=r.players.flatMap(x=>x.hand).filter(v=>v<value);
    p.hand.shift(); r.pile.push(value);
    if(lower.length){
      r.lives--;
      r.players.forEach(x=>x.hand=x.hand.filter(v=>!lower.includes(v)));
      r.message=`Ops! Havia ${lower.length} carta(s) menor(es). A equipe perdeu 1 vida.`;
      if(r.lives<=0){r.status='lost'; r.message='Sem vidas. Fim de jogo.'; emitRoom(r); return;}
    } else r.message=`${p.name} jogou ${value}.`;
    checkLevel(r); emitRoom(r);
  });
  socket.on('proposeStar', (c:string)=>{
    const r=rooms.get(c); if(!r||r.status!=='playing'||r.stars<1) return;
    const p=r.players.find(x=>x.id===socket.id); if(!p) return; p.starVote=true; r.message=`${p.name} propôs usar uma estrela. Todos devem confirmar.`; emitRoom(r);
  });
  socket.on('voteStar', (c:string)=>{
    const r=rooms.get(c); if(!r||r.status!=='playing'||r.stars<1) return;
    const p=r.players.find(x=>x.id===socket.id); if(!p) return; p.starVote=true;
    if(r.players.every(x=>x.starVote)){
      r.stars--; const discarded:number[]=[];
      r.players.forEach(x=>{ if(x.hand.length) discarded.push(x.hand.shift()!); x.starVote=false; });
      r.message=`Estrela usada: menores cartas descartadas (${discarded.sort((a,b)=>a-b).join(', ')}).`;
      checkLevel(r);
    }
    emitRoom(r);
  });
  socket.on('disconnect', ()=>{
    for(const [c,r] of rooms){
      const before=r.players.length; r.players=r.players.filter(p=>p.id!==socket.id);
      if(r.players.length!==before){ if(!r.players.length) rooms.delete(c); else { if(r.hostId===socket.id) r.hostId=r.players[0].id; emitRoom(r); } }
    }
  });
});
app.get('/health', (_, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`MindSync server on :${PORT}`);
});
