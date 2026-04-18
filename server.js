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

// ─── Spotify Client Credentials (로그인 불필요) ───
let spotifyToken = { value: null, expiry: 0 };

async function getSpotifyToken() {
  if (spotifyToken.value && Date.now() < spotifyToken.expiry - 60000) return spotifyToken.value;
  console.log('[Spotify] 토큰 발급 시도. CLIENT_ID:', SPOTIFY_CLIENT_ID ? '있음' : '없음!!!');
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  const data = await resp.json();
  console.log('[Spotify] 토큰 응답:', data.error || '성공 (token 길이: ' + (data.access_token?.length || 0) + ')');
  if (data.error) throw new Error(`Spotify 토큰 오류: ${data.error} - ${data.error_description}`);
  spotifyToken.value  = data.access_token;
  spotifyToken.expiry = Date.now() + data.expires_in * 1000;
  return spotifyToken.value;
}

// 서버 시작 시 토큰 미리 발급
getSpotifyToken().catch(e => console.error('[Spotify] 시작 토큰 실패:', e.message));

app.get('/spotify/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  try {
    console.log('[Spotify] 검색:', q);
    const token = await getSpotifyToken();
    const resp = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=6&market=KR`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await resp.text();
    console.log('[Spotify] HTTP상태:', resp.status, '/ 응답 앞부분:', text.substring(0, 300));
    const data = JSON.parse(text);
    console.log('[Spotify] 검색 결과 수:', data.tracks?.items?.length ?? '오류: ' + JSON.stringify(data));
    const tracks = (data.tracks?.items || []).map(t => ({
      id:         t.id,
      uri:        t.uri,
      name:       t.name,
      artist:     t.artists.map(a => a.name).join(', '),
      albumArt:   t.album.images[1]?.url || '',
      previewUrl: t.preview_url,
      embedUrl:   `https://open.spotify.com/embed/track/${t.id}?utm_source=generator&theme=0`,
    }));
    res.json(tracks);
  } catch (e) {
    console.error('[Spotify] 검색 오류:', e.message);
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
  socket.on('host:load',   (d) => { gameState = { ...gameState, ...d, revealStep: 0 }; io.emit('player:load',  d); });
  socket.on('host:play',   (d) => { gameState.isPlaying = true;  gameState.currentTime = d.currentTime; io.emit('player:play',   d); });
  socket.on('host:pause',  (d) => { gameState.isPlaying = false; gameState.currentTime = d.currentTime; io.emit('player:pause',  d); });
  socket.on('host:seek',   (d) => { gameState.currentTime = d.time; io.emit('player:seek',  d); });
  socket.on('host:reveal', (d) => { gameState.revealStep = d.step; io.emit('player:reveal', d); });
  socket.on('host:mode',   (d) => { gameState.mode = d.mode; io.emit('player:mode', d); });
  socket.on('host:timer',  (d) => { Object.assign(gameState, d); io.emit('player:timer', d); });
});

server.listen(PORT, () => {
  console.log(`서버: http://localhost:${PORT}`);
  console.log(`진행자: http://localhost:${PORT}/host`);
  console.log(`Spotify 로그인: http://localhost:${PORT}/spotify/login`);
});
