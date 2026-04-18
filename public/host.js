const socket = io();

let songs = [];
let currentIndex = 0;
let isAIPlaying = false;
let timerInterval = null;
let timerLeft = 0;

const audioAI    = document.getElementById('audio-ai');
const btnPlayAI  = document.getElementById('btn-play-ai');
const progressBar = document.getElementById('progress-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal   = document.getElementById('time-total');

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

function prevSong() { if (songs.length) loadSong((currentIndex - 1 + songs.length) % songs.length, isAIPlaying); }
function nextSong() { if (songs.length) loadSong((currentIndex + 1) % songs.length, isAIPlaying); }

// ─── 랜덤 재생 ───
function randomSong() {
  if (songs.length < 2) return loadSong(0, true);
  let idx;
  do { idx = Math.floor(Math.random() * songs.length); } while (idx === currentIndex);
  loadSong(idx, true);
}

// ─── YouTube 원곡 ───
function extractYoutubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^&\n?#]{11})/);
  return m ? m[1] : null;
}

function loadYoutube() {
  const url = document.getElementById('yt-url-input').value.trim();
  const id  = extractYoutubeId(url);
  if (!id) return alert('올바른 YouTube URL을 입력해주세요!');

  const iframe = document.getElementById('yt-iframe');
  iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1`;

  document.getElementById('yt-embed-wrap').classList.remove('hidden');
  document.getElementById('yt-placeholder').classList.add('hidden');
  socket.emit('host:mode', { mode: 'original' });
}

function clearYoutube() {
  document.getElementById('yt-iframe').src = '';
  document.getElementById('yt-embed-wrap').classList.add('hidden');
  document.getElementById('yt-placeholder').classList.remove('hidden');
  document.getElementById('yt-url-input').value = '';
  socket.emit('host:mode', { mode: 'ai' });
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
  progressBar.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--card) ${pct}%)`;
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
