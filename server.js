const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/music', express.static('music'));

// 진행자 페이지
app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'music/'),
  filename: (req, file, cb) => {
    const safe = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, safe);
  }
});
const upload = multer({ storage });

const metaPath = path.join(__dirname, 'music', 'songs.json');

function readSongs() {
  if (!fs.existsSync(metaPath)) return [];
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

function writeSongs(songs) {
  fs.writeFileSync(metaPath, JSON.stringify(songs, null, 2));
}

app.get('/api/songs', (req, res) => res.json(readSongs()));

app.post('/api/songs', (req, res) => {
  const songs = readSongs();
  songs.push(req.body);
  writeSongs(songs);
  res.json({ ok: true });
});

app.put('/api/songs/:index', (req, res) => {
  const songs = readSongs();
  songs[req.params.index] = req.body;
  writeSongs(songs);
  res.json({ ok: true });
});

app.delete('/api/songs/:index', (req, res) => {
  const songs = readSongs();
  songs.splice(Number(req.params.index), 1);
  writeSongs(songs);
  res.json({ ok: true });
});

app.post('/api/upload', upload.single('mp3'), (req, res) => {
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  res.json({ filename: name });
});

// ─── Socket.io 실시간 동기화 ───
// 현재 게임 상태 (서버가 기억)
let gameState = {
  songIndex: 0,
  isPlaying: false,
  currentTime: 0,
  revealStep: 0,   // 0=숨김 1=힌트 2=아티스트 3=전체공개
  mode: 'ai',      // 'ai' | 'original'
  timerSeconds: 0,
  timerRunning: false
};

io.on('connection', (socket) => {
  // 새 참가자에게 현재 상태 전송
  socket.emit('state:sync', gameState);

  // 진행자 → 서버 → 모든 참가자
  socket.on('host:load',    (data) => { gameState = { ...gameState, ...data, revealStep: 0 }; io.emit('player:load', data); });
  socket.on('host:play',    (data) => { gameState.isPlaying = true; gameState.currentTime = data.currentTime; io.emit('player:play', data); });
  socket.on('host:pause',   (data) => { gameState.isPlaying = false; gameState.currentTime = data.currentTime; io.emit('player:pause', data); });
  socket.on('host:seek',    (data) => { gameState.currentTime = data.time; io.emit('player:seek', data); });
  socket.on('host:reveal',  (data) => { gameState.revealStep = data.step; io.emit('player:reveal', data); });
  socket.on('host:mode',    (data) => { gameState.mode = data.mode; io.emit('player:mode', data); });
  socket.on('host:timer',   (data) => { Object.assign(gameState, data); io.emit('player:timer', data); });
});

server.listen(PORT, () => console.log(`서버 실행: http://localhost:${PORT}  진행자: http://localhost:${PORT}/host`));
