const socket = io();

let songs = [];
let currentIndex = 0;
let isAIPlaying = false;
let timerInterval = null;
let timerLeft = 0;

const audioAI    = document.getElementById('audio-ai');
const audioOrig  = document.getElementById('audio-orig');
const btnPlayAI  = document.getElementById('btn-play-ai');
const btnPlayOrig = document.getElementById('btn-play-orig');
const progressBar = document.getElementById('progress-bar');
const progressBarOrig = document.getElementById('progress-bar-orig');
const timeCurrent = document.getElementById('time-current');
const timeTotal   = document.getElementById('time-total');
let isOrigPlaying = false;

// ─── 초기화 ───
async function init() {
  const res = await fetch('/api/songs');
  songs = await res.json();
  renderPlaylist();
  if (songs.length > 0) loadSong(0, false);
}

// ─── 곡 로드 ───
function loadSong(index, autoPlay = false) {
  if (!songs[index]) return;
  currentIndex = index;
  const s = songs[index];

  audioAI.src = s.filename ? `/music/${encodeURIComponent(s.filename)}` : '';
  audioAI.load();

  document.getElementById('hnp-num').textContent     = `${index + 1} / ${songs.length}`;
  document.getElementById('hnp-title').textContent   = s.title  || s.filename;
  document.getElementById('hnp-artist').textContent  = s.artist || '';
  document.getElementById('host-lyrics').textContent = s.lyrics || '(가사 없음)';

  // 원곡 MP3 로드
  const localPlayer = document.getElementById('orig-local-player');
  if (s.originalFilename) {
    audioOrig.src = `/music/${encodeURIComponent(s.originalFilename)}`;
    audioOrig.load();
    document.getElementById('orig-local-label').textContent = `🎵 ${s.title} (원곡)`;
    localPlayer.classList.remove('hidden');
    document.getElementById('yt-placeholder').classList.add('hidden');
  } else {
    audioOrig.src = '';
    localPlayer.classList.add('hidden');
    document.getElementById('yt-placeholder').classList.remove('hidden');
  }
  isOrigPlaying = false;
  if (btnPlayOrig) btnPlayOrig.textContent = '▶';

  // 저장된 YouTube URL 자동 로드
  const ytInput = document.getElementById('yt-url-input');
  if (s.youtubeUrl) {
    ytInput.value = s.youtubeUrl;
    loadYoutube();
  } else {
    ytInput.value = '';
    clearYoutube();
  }

  updatePlaylistHighlight();
  setReveal(0);
  socket.emit('host:load', { songIndex: index });

  if (autoPlay) {
    audioAI.play();
    btnPlayAI.textContent = '⏸';
    isAIPlaying = true;
    socket.emit('host:play', { currentTime: 0 });
  } else {
    isAIPlaying = false;
    btnPlayAI.textContent = '▶';
  }
}

// ─── 원곡 재생/정지 ───
function toggleOrig() {
  if (!audioOrig.src) return;
  if (isOrigPlaying) {
    audioOrig.pause();
    btnPlayOrig.textContent = '▶';
    isOrigPlaying = false;
  } else {
    audioOrig.play();
    btnPlayOrig.textContent = '⏸';
    isOrigPlaying = true;
  }
}

audioOrig.addEventListener('timeupdate', () => {
  if (!audioOrig.duration) return;
  const pct = (audioOrig.currentTime / audioOrig.duration) * 100;
  progressBarOrig.value = pct;
  progressBarOrig.style.background = `linear-gradient(to right, #ff0000 ${pct}%, var(--card) ${pct}%)`;
  document.getElementById('time-current-orig').textContent = fmt(audioOrig.currentTime);
});
audioOrig.addEventListener('loadedmetadata', () => {
  document.getElementById('time-total-orig').textContent = fmt(audioOrig.duration);
});
audioOrig.addEventListener('ended', () => { isOrigPlaying = false; btnPlayOrig.textContent = '▶'; });

function seekOrig(val) {
  if (audioOrig.duration) audioOrig.currentTime = (val / 100) * audioOrig.duration;
}

// ─── AI 재생/정지 ───
function toggleAI() {
  if (!songs.length) return;
  if (isAIPlaying) {
    audioAI.pause();
    btnPlayAI.textContent = '▶';
    isAIPlaying = false;
    socket.emit('host:pause', { currentTime: audioAI.currentTime });
  } else {
    audioAI.play();
    btnPlayAI.textContent = '⏸';
    isAIPlaying = true;
    socket.emit('host:play', { currentTime: audioAI.currentTime });
  }
}

function toggleAIMute() {
  const btn = document.getElementById('btn-mute-ai');
  audioAI.muted = !audioAI.muted;
  btn.textContent = audioAI.muted ? '🔊' : '🔇';
  btn.title = audioAI.muted ? '호스트 소리 켜기' : '호스트 소리 끄기';
}

function prevSong() { if (songs.length) loadSong((currentIndex - 1 + songs.length) % songs.length, isAIPlaying); }
function nextSong() { if (songs.length) loadSong((currentIndex + 1) % songs.length, isAIPlaying); }

// ─── 랜덤 재생 ───
function randomSong() {
  if (songs.length < 2) return loadSong(0, true);
  let idx;
  do { idx = Math.floor(Math.random() * songs.length); } while (idx === currentIndex);
  loadSong(idx, true);
}

// ─── YouTube 원곡 (IFrame Player API) ───
let ytPlayer = null;
let _ytVideoId = '';
let _ytShownOnAudience = false;
let _hostMuted = true;

function extractYoutubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^&\n?#]{11})/);
  return m ? m[1] : null;
}

function onYouTubeIframeAPIReady() { /* YT API 로드 완료 — loadYoutube()에서 플레이어 생성 */ }

function loadYoutube() {
  const url = document.getElementById('yt-url-input').value.trim();
  const id  = extractYoutubeId(url);
  if (!id) return alert('올바른 YouTube URL을 입력해주세요!');

  document.getElementById('yt-embed-wrap').classList.remove('hidden');
  document.getElementById('yt-placeholder').classList.add('hidden');
  socket.emit('host:mode', { mode: 'original' });

  _ytVideoId = id;
  _ytShownOnAudience = false;
  document.getElementById('yt-send-btn').textContent = '📺 참가자 화면에 표시';
  document.getElementById('yt-send-btn').classList.remove('active');

  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(id);
    return;
  }
  ytPlayer = new YT.Player('yt-player', {
    height: '185', width: '100%', videoId: id,
    playerVars: { autoplay: 0, mute: 1 },
    events: { onStateChange: onHostYTStateChange }
  });
  _hostMuted = true;
  document.getElementById('yt-mute-btn').textContent = '🔊 소리 켜기';
}

function onHostYTStateChange(event) {
  if (!_ytShownOnAudience) return;
  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit('host:yt-play', { time: ytPlayer.getCurrentTime() });
  } else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit('host:yt-pause', { time: ytPlayer.getCurrentTime() });
  }
}

function toggleHostMute() {
  if (!ytPlayer) return;
  const btn = document.getElementById('yt-mute-btn');
  if (_hostMuted) {
    ytPlayer.unMute();
    _hostMuted = false;
    btn.textContent = '🔇 소리 끄기';
  } else {
    ytPlayer.mute();
    _hostMuted = true;
    btn.textContent = '🔊 소리 켜기';
  }
}

function toggleYoutubeOnAudience() {
  const btn = document.getElementById('yt-send-btn');
  if (_ytShownOnAudience) {
    socket.emit('host:youtube', { videoId: '' });
    _ytShownOnAudience = false;
    btn.textContent = '📺 참가자 화면에 표시';
    btn.classList.remove('active');
  } else {
    socket.emit('host:youtube', { videoId: _ytVideoId });
    _ytShownOnAudience = true;
    btn.textContent = '🙈 참가자 화면에서 숨기기';
    btn.classList.add('active');
  }
}

function clearYoutube() {
  if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
  document.getElementById('yt-embed-wrap').classList.add('hidden');
  document.getElementById('yt-placeholder').classList.remove('hidden');
  document.getElementById('yt-url-input').value = '';
  _ytVideoId = '';
  _ytShownOnAudience = false;
  document.getElementById('yt-send-btn').textContent = '📺 참가자 화면에 표시';
  document.getElementById('yt-send-btn').classList.remove('active');
  socket.emit('host:mode', { mode: 'ai' });
  socket.emit('host:youtube', { videoId: '' });
}

// URL 붙여넣기 시 자동 로드
document.getElementById('yt-url-input').addEventListener('paste', (e) => {
  setTimeout(() => {
    const val = e.target.value.trim();
    if (extractYoutubeId(val)) loadYoutube();
  }, 50);
});

// ─── 진행 바 ───
audioAI.addEventListener('timeupdate', () => {
  if (!audioAI.duration) return;
  const pct = (audioAI.currentTime / audioAI.duration) * 100;
  progressBar.value = pct;
  progressBar.style.background = `linear-gradient(to right, #7c3aed ${pct}%, rgba(255,255,255,0.15) ${pct}%)`;
  timeCurrent.textContent = fmt(audioAI.currentTime);
});
audioAI.addEventListener('loadedmetadata', () => { timeTotal.textContent = fmt(audioAI.duration); });
audioAI.addEventListener('ended', () => { isAIPlaying = false; btnPlayAI.textContent = '▶'; });

function seekAudio(val) {
  if (audioAI.duration) {
    audioAI.currentTime = (val / 100) * audioAI.duration;
    socket.emit('host:seek', { time: audioAI.currentTime });
  }
}

function fmt(s) {
  if (isNaN(s) || s == null) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

// ─── 타이머 ───
function startTimer() {
  clearInterval(timerInterval);
  timerLeft = parseInt(document.getElementById('timer-input').value) || 30;
  updateTimerDisplay();
  socket.emit('host:timer', { timerRunning: true, timerSeconds: timerLeft });
  timerInterval = setInterval(() => {
    timerLeft--;
    updateTimerDisplay();
    socket.emit('host:timer', { timerRunning: true, timerSeconds: timerLeft });
    if (timerLeft <= 0) { clearInterval(timerInterval); socket.emit('host:timer', { timerRunning: false, timerSeconds: 0 }); }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerLeft = 0;
  const el = document.getElementById('timer-display');
  el.textContent = '--';
  el.classList.remove('urgent');
  socket.emit('host:timer', { timerRunning: false, timerSeconds: 0 });
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  el.textContent = timerLeft;
  el.classList.toggle('urgent', timerLeft <= 10 && timerLeft > 0);
}

// ─── 실시간 힌트 전송 ───
function sendLiveHint() {
  const text = document.getElementById('live-hint-input').value.trim();
  if (!text) return;
  socket.emit('host:hint', { text });
}

function clearLiveHint() {
  document.getElementById('live-hint-input').value = '';
  socket.emit('host:hint', { text: '' });
}

// ─── YouTube URL 저장 ───
async function saveYoutubeUrl() {
  const url = document.getElementById('yt-url-input').value.trim();
  if (!url) return alert('YouTube URL을 먼저 입력해주세요!');
  if (!extractYoutubeId(url)) return alert('올바른 YouTube URL이 아니에요!');

  const song = { ...songs[currentIndex], youtubeUrl: url };
  await fetch(`/api/songs/${currentIndex}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(song)
  });
  songs[currentIndex] = song;
  alert('✅ YouTube URL 저장됨!');
}

// ─── 정답 공개 ───
function setReveal(step) {
  [0,1,2,3].forEach(i => document.getElementById(`step-${i}`).classList.toggle('active', i === step));
  socket.emit('host:reveal', { step });
}

// ─── 플레이리스트 ───
function renderPlaylist() {
  const ul = document.getElementById('host-playlist');
  ul.innerHTML = '';
  songs.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = i === currentIndex ? 'active' : '';
    li.innerHTML = `
      <span class="pl-num">${i+1}</span>
      <div class="pl-info">
        <div class="pl-title">${s.title || s.filename}</div>
        <div class="pl-artist">${s.artist || ''}</div>
      </div>`;
    li.onclick = () => loadSong(i, isAIPlaying);
    ul.appendChild(li);
  });
}

function updatePlaylistHighlight() {
  document.querySelectorAll('#host-playlist li').forEach((li,i) => li.className = i===currentIndex?'active':'');
}

// ─── 일괄 업로드 ───
let bulkQueue = [];
let bulkIndex = 0;
let bulkFilenames = [];

async function startBulkUpload() {
  const files = Array.from(document.getElementById('bulk-upload').files);
  if (!files.length) return alert('MP3 파일을 선택해주세요!');

  bulkQueue = files;
  bulkIndex = 0;
  bulkFilenames = [];

  // 먼저 모든 파일 서버에 업로드
  document.getElementById('bulk-progress').textContent = '파일 업로드 중...';
  document.getElementById('bulk-queue').classList.remove('hidden');

  for (const file of files) {
    const fd = new FormData();
    fd.append('mp3', file);
    const { filename } = await fetch('/api/upload', { method:'POST', body: fd }).then(r=>r.json());
    bulkFilenames.push(filename);
  }

  showBulkForm();
}

function showBulkForm() {
  if (bulkIndex >= bulkQueue.length) {
    document.getElementById('bulk-queue').classList.add('hidden');
    document.getElementById('bulk-upload').value = '';
    document.getElementById('bulk-progress').textContent = '';
    alert(`✅ ${bulkQueue.length}곡 모두 추가 완료!`);
    init();
    renderManageList();
    return;
  }

  const file = bulkQueue[bulkIndex];
  const name = file.name.replace('.mp3','').replace(/[-_]/g,' ');
  document.getElementById('bulk-file-label').textContent = `📄 ${bulkIndex+1}/${bulkQueue.length}: ${file.name}`;
  document.getElementById('bulk-progress').textContent = `진행: ${bulkIndex+1} / ${bulkQueue.length}`;
  document.getElementById('input-title').value  = name;
  document.getElementById('input-artist').value = '';
  document.getElementById('input-hint').value   = '';
  document.getElementById('input-lyrics').value = '';
  document.getElementById('input-title').focus();
}

async function saveBulkCurrent() {
  const title  = document.getElementById('input-title').value.trim();
  const artist = document.getElementById('input-artist').value.trim();
  const hint   = document.getElementById('input-hint').value.trim();
  const lyrics = document.getElementById('input-lyrics').value.trim();
  if (!title) return alert('제목을 입력해주세요!');

  // 원곡 파일 업로드 (있으면)
  let originalFilename = '';
  const origFile = document.getElementById('bulk-orig-file').files[0];
  if (origFile) {
    const fd = new FormData();
    fd.append('mp3', origFile);
    const r = await fetch('/api/upload', { method:'POST', body: fd }).then(r=>r.json());
    originalFilename = r.filename;
  }

  await fetch('/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: bulkFilenames[bulkIndex], originalFilename, title, artist, hint, lyrics })
  });

  document.getElementById('bulk-orig-file').value = '';
  bulkIndex++;
  showBulkForm();
}

async function skipBulkCurrent() {
  // 파일은 서버에 이미 올라갔지만 songs.json엔 안 넣음
  bulkIndex++;
  showBulkForm();
}

// ─── 곡 관리 모달 ───
function toggleManage() {
  const m = document.getElementById('modal-manage');
  m.classList.toggle('hidden');
  if (!m.classList.contains('hidden')) renderManageList();
}

function renderManageList() {
  const ul = document.getElementById('manage-list');
  ul.innerHTML = '';
  songs.forEach((s,i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${i+1}. ${s.title||s.filename}</span><button class="del-btn" onclick="deleteSong(${i})">삭제</button>`;
    ul.appendChild(li);
  });
}

async function addSong() {
  const fileAI = document.getElementById('upload-file').files[0];
  const title  = document.getElementById('input-title').value.trim();
  const artist = document.getElementById('input-artist').value.trim();
  const hint   = document.getElementById('input-hint').value.trim();
  const lyrics = document.getElementById('input-lyrics').value.trim();

  if (!fileAI)  return alert('AI 버전 MP3를 선택해주세요!');
  if (!title)   return alert('곡 제목을 입력해주세요!');

  const fd = new FormData();
  fd.append('mp3', fileAI);
  const { filename } = await fetch('/api/upload', { method:'POST', body: fd }).then(r=>r.json());

  await fetch('/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, title, artist, hint, lyrics })
  });

  ['upload-file','input-title','input-artist','input-hint','input-lyrics'].forEach(id => {
    document.getElementById(id).value = '';
  });

  await init();
  renderManageList();
  alert(`"${title}" 추가 완료!`);
}

async function deleteSong(index) {
  if (!confirm(`"${songs[index].title}" 을(를) 삭제할까요?`)) return;
  await fetch(`/api/songs/${index}`, { method:'DELETE' });
  await init();
  renderManageList();
}

// ─── 점수판 ───
let scores = [];

function emitScores() {
  socket.emit('host:scores', { scores });
}

function addPlayer() {
  const input = document.getElementById('score-name-input');
  const name = input.value.trim();
  if (!name) return;
  if (scores.find(p => p.name === name)) { input.value = ''; return; }
  scores.push({ name, score: 0 });
  input.value = '';
  renderScores();
  emitScores();
}

function adjustScore(index, delta) {
  scores[index].score += delta;
  renderScores();
  emitScores();
}

function removePlayer(index) {
  scores.splice(index, 1);
  renderScores();
  emitScores();
}

function resetScores() {
  if (!confirm('점수를 모두 초기화할까요?')) return;
  scores = [];
  renderScores();
  emitScores();
}

function renderScores() {
  const sorted = [...scores].map((p, i) => ({ ...p, origIdx: i }))
    .sort((a, b) => b.score - a.score);
  const ul = document.getElementById('score-list');
  ul.innerHTML = '';
  sorted.forEach((p, rank) => {
    const li = document.createElement('li');
    li.className = 'score-item';
    const rankClass = rank === 0 ? 'r1' : rank === 1 ? 'r2' : rank === 2 ? 'r3' : '';
    const rankLabel = rank === 0 ? '👑' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank+1}`;
    li.innerHTML = `
      <div class="score-item-top">
        <span class="score-item-rank">${rankLabel}</span>
        <span class="score-item-name">${p.name}</span>
        <span class="score-item-pts">${p.score}</span>
      </div>
      <div class="score-item-btns">
        <button class="score-btn" onclick="adjustScore(${p.origIdx},3)">+3</button>
        <button class="score-btn" onclick="adjustScore(${p.origIdx},2)">+2</button>
        <button class="score-btn" onclick="adjustScore(${p.origIdx},1)">+1</button>
        <button class="score-btn minus" onclick="adjustScore(${p.origIdx},-1)">-1</button>
        <button class="score-btn del" onclick="removePlayer(${p.origIdx})">✕</button>
      </div>`;
    ul.appendChild(li);
  });
}

// 서버에서 scores 동기화
socket.on('state:sync', (d) => {
  if (d.scores) { scores = d.scores; renderScores(); }
});

// ─── 키보드 단축키 ───
document.addEventListener('keydown', e => {
  if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  if (e.code==='Space')      { e.preventDefault(); toggleAI(); }
  if (e.code==='ArrowRight') nextSong();
  if (e.code==='ArrowLeft')  prevSong();
  if (e.code==='KeyR')       randomSong();
  if (e.code==='Digit1')     setReveal(0);
  if (e.code==='Digit2')     setReveal(1);
  if (e.code==='Digit3')     setReveal(2);
  if (e.code==='Digit4')     setReveal(3);
});

init();
