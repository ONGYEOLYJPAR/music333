require('dotenv').config();
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

const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI          = process.env.REDIRECT_URI || `http://localhost:${PORT}/spotify/callback`;

app.use(express.json());
app.use(express.static('public'));
app.use('/music', express.static('music'));

app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));

// ─── iTunes Search API (무료, 인증 없음) ───
app.get('/spotify/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=6&country=KR`;
    const resp = await fetch(url);
    const data = await resp.json();
    const tracks = (data.results || []).map(t => ({
      id:         String(t.trackId),
      name:       t.trackName,
      artist:     t.artistName,
      albumArt:   t.artworkUrl100?.replace('100x100', '300x300') || '',
      previewUrl: t.previewUrl || '',
    }));
    res.json(tracks);
  } catch (e) {
    console.error('[iTunes] 검색 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── 파일 업로드 ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'music/'),
  filename: (req, file, cb) => {
    const safe = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, safe);
  },
});
const upload = multer({ storage });

const metaPath = path.join(__dirname, 'music', 'songs.json');
function readSongs()    { return fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')) : []; }
function writeSongs(s)  { fs.writeFileSync(metaPath, JSON.stringify(s, null, 2)); }

app.get('/api/songs',         (req, res) => res.json(readSongs()));
app.post('/api/songs',        (req, res) => { const s = readSongs(); s.push(req.body); writeSongs(s); res.json({ ok: true }); });
app.put('/api/songs/:index',  (req, res) => { const s = readSongs(); s[req.params.index] = req.body; writeSongs(s); res.json({ ok: true }); });
app.delete('/api/songs/:index', (req, res) => { const s = readSongs(); s.splice(Number(req.params.index), 1); writeSongs(s); res.json({ ok: true }); });
app.post('/api/upload', upload.single('mp3'), (req, res) => {
  res.json({ filename: Buffer.from(req.file.originalname, 'latin1').toString('utf8') });
});

// ─── Socket.io ───
let gameState = { songIndex: 0, isPlaying: false, currentTime: 0, revealStep: 0, mode: 'ai', timerSeconds: 0, timerRunning: false };

io.on('connection', (socket) => {
  socket.emit('state:sync', gameState);
  socket.on('host:load',   (d) => { gameState = { ...gameState, ...d, revealStep: 0 }; io.emit('player:load', d); });
  socket.on('host:play',   (d) => { gameState.isPlaying = true;  gameState.currentTime = d.currentTime; io.emit('player:play',  d); });
  socket.on('host:pause',  (d) => { gameState.isPlaying = false; gameState.currentTime = d.currentTime; io.emit('player:pause', d); });
  socket.on('host:seek',   (d) => { gameState.currentTime = d.time; io.emit('player:seek', d); });
  socket.on('host:reveal', (d) => {
    gameState.revealStep = d.step;
    const songs = readSongs();
    const song  = songs[gameState.songIndex] || {};
    io.emit('player:reveal', { step: d.step, song });
  });
  socket.on('host:mode',   (d) => { gameState.mode = d.mode; io.emit('player:mode', d); });
  socket.on('host:timer',  (d) => { Object.assign(gameState, d); io.emit('player:timer', d); });
  socket.on('host:hint',   (d) => { gameState.liveHint = d.text; io.emit('player:hint', d); });

  // 접속 시 state:sync에도 곡 데이터 포함
  socket.on('disconnect', () => {});
});

server.listen(PORT, () => {
  console.log(`서버: http://localhost:${PORT}`);
  console.log(`진행자: http://localhost:${PORT}/host`);
  console.log(`Spotify 로그인: http://localhost:${PORT}/spotify/login`);
});
