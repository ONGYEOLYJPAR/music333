const socket = io();

let songs = [];
let currentIndex = 0;
let isPlaying = false;
let currentMode = 'ai';
let timerInterval = null;
let timerLeft = 0;

const audioAI = document.getElementById('audio-ai');
const btnPlay = document.getElementById('btn-play');
const progressBar = document.getElementById('progress-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal   = document.getElementById('time-total');

// ─── Spotify 검색 + 임베드 ───
async function searchSpotify() {
  const input = document.getElementById('sp-search-input');
  const q = input.value.trim();
  if (!q) return;

  const res = await fetch(`/spotify/search?q=${encodeURIComponent(q)}`);
  const tracks = await res.json();

  const ul  = document.getElementById('search-results');
  const box = document.getElementById('spotify-search');
  ul.innerHTML = '';

  if (!tracks.length) {
    ul.innerHTML = '<li style="color:var(--muted);padding:0.5rem">검색 결과 없음</li>';
  } else {
    tracks.forEach(t => {
      const li = document.createElement('li');
      li.className = 'search-result-item';
      const safeId   = t.id;
      const safeName = t.name.replace(/'/g, "\\'");
      li.innerHTML = `
        <img src="${t.albumArt}" width="42" height="42" style="border-radius:5px;flex-shrink:0"/>
        <div class="sr-info">
          <div class="sr-title">${t.name}</div>
          <div class="sr-artist">${t.artist}</div>
        </div>
        <button class="sr-select" onclick="loadSpotifyEmbed('${safeId}','${safeName}')">▶ 재생</button>`;
      ul.appendChild(li);
    });
  }
  box.classList.remove('hidden');
}

function loadSpotifyEmbed(trackId, trackName) {
  const iframe = document.getElementById('spotify-iframe');
  iframe.src = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0&autoplay=1`;
  document.getElementById('spotify-embed').classList.remove('hidden');
  document.getElementById('spotify-search').classList.add('hidden');
  document.getElementById('btn-mode-orig').textContent = `🎵 ${trackName}`;
  socket.emit('host:mode', { mode: 'original' });
}

function closeSpotify() {
  const iframe = document.getElementById('spotify-iframe');
  iframe.src = '';
  document.getElementById('spotify-embed').classList.add('hidden');
  setMode('ai');
}

// ─── 초기화 ───
async function init() {
  const res = await fetch('/api/songs');
  songs = await res.json();
  renderPlaylist();
  if (songs.length > 0) loadSong(currentIndex, false);
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
  document.getElementById('btn-mode-orig').textContent = '🎵 원곡 (Spotify)';

  // 곡 바뀌면 Spotify 트랙 초기화
  spotifyTrackUri = null;
  document.getElementById('spotify-search').classList.add('hidden');

  updatePlaylistHighlight();
  setReveal(0);

  socket.emit('host:load', { songIndex: index });

  if (autoPlay) {
    isPlaying = true;
    activeAudio().play();
    btnPlay.textContent = '⏸';
    socket.emit('host:play', { currentTime: 0 });
  } else {
    isPlaying = false;
    btnPlay.textContent = '▶';
  }
}

// ─── 재생/정지 ───
function togglePlay() {
  if (!songs.length) return;
  if (isPlaying) {
    pauseAll();
    socket.emit('host:pause', { currentTime: getCurrentTime() });
  } else {
    playAll();
    socket.emit('host:play', { currentTime: getCurrentTime() });
  }
}

function playAll() {
  audioAI.play();
  btnPlay.textContent = '⏸';
  isPlaying = true;
}

function pauseAll() {
  audioAI.pause();
  btnPlay.textContent = '▶';
  isPlaying = false;
}

function getCurrentTime() {
  return audioAI.currentTime;
}

function prevSong() { if (songs.length) loadSong((currentIndex - 1 + songs.length) % songs.length, isPlaying); }
function nextSong() { if (songs.length) loadSong((currentIndex + 1) % songs.length, isPlaying); }

// ─── 모드 전환 ───
function setMode(mode) {
  currentMode = mode;
  document.getElementById('btn-mode-ai').classList.toggle('active', mode === 'ai');
  document.getElementById('btn-mode-orig').classList.toggle('active', mode === 'original');
  socket.emit('host:mode', { mode });
  if (mode === 'ai') {
    document.getElementById('sp-search-input').value = '';
  }
}

// ─── 정답 공개 단계 ───
function setReveal(step) {
  [0,1,2,3].forEach(i => {
    document.getElementById(`step-${i}`).classList.toggle('active', i === step);
  });
  socket.emit('host:reveal', { step });
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
  document.getElementById('timer-display').textContent = '--';
  document.getElementById('timer-display').classList.remove('urgent');
  socket.emit('host:timer', { timerRunning: false, timerSeconds: 0 });
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-display');
  el.textContent = timerLeft;
  el.classList.toggle('urgent', timerLeft <= 10 && timerLeft > 0);
}

// ─── 진행 바 ───
audioAI.addEventListener('timeupdate', () => {
  if (currentMode !== 'ai' || !audioAI.duration) return;
  const pct = (audioAI.currentTime / audioAI.duration) * 100;
  progressBar.value = pct;
  progressBar.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--card) ${pct}%)`;
  timeCurrent.textContent = fmt(audioAI.currentTime);
});
audioAI.addEventListener('loadedmetadata', () => {
  if (currentMode === 'ai') timeTotal.textContent = fmt(audioAI.duration);
});
audioAI.addEventListener('ended', () => { isPlaying = false; btnPlay.textContent = '▶'; });

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
    li.onclick = () => loadSong(i, isPlaying);
    ul.appendChild(li);
  });
}

function updatePlaylistHighlight() {
  document.querySelectorAll('#host-playlist li').forEach((li,i) => li.className = i===currentIndex?'active':'');
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
  const fileAI  = document.getElementById('upload-file').files[0];
  const title   = document.getElementById('input-title').value.trim();
  const artist  = document.getElementById('input-artist').value.trim();
  const hint    = document.getElementById('input-hint').value.trim();
  const lyrics  = document.getElementById('input-lyrics').value.trim();
  const spotifyQuery = document.getElementById('input-spotify-query').value.trim();

  if (!fileAI)  return alert('AI 버전 MP3를 선택해주세요!');
  if (!title)   return alert('곡 제목을 입력해주세요!');

  const fd = new FormData();
  fd.append('mp3', fileAI);
  const { filename } = await fetch('/api/upload', { method:'POST', body: fd }).then(r=>r.json());

  await fetch('/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, title, artist, hint, lyrics, spotifyQuery })
  });

  ['upload-file','input-title','input-artist','input-hint','input-lyrics','input-spotify-query'].forEach(id => {
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

// ─── 키보드 단축키 ───
document.addEventListener('keydown', e => {
  if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  if (e.code==='Space')      { e.preventDefault(); togglePlay(); }
  if (e.code==='ArrowRight') nextSong();
  if (e.code==='ArrowLeft')  prevSong();
  if (e.code==='Digit1')     setReveal(0);
  if (e.code==='Digit2')     setReveal(1);
  if (e.code==='Digit3')     setReveal(2);
  if (e.code==='Digit4')     setReveal(3);
});

init();
