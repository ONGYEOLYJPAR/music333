const socket = io();

let songs = [];
let currentIndex = 0;
let isPlaying = false;
let currentMode = 'ai';
let timerInterval = null;
let timerLeft = 0;

const audioAI   = document.getElementById('audio-ai');
const audioOrig = document.getElementById('audio-orig');
const btnPlay   = document.getElementById('btn-play');
const progressBar = document.getElementById('progress-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal   = document.getElementById('time-total');

function activeAudio() { return currentMode === 'ai' ? audioAI : audioOrig; }

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

  audioAI.src   = s.filename   ? `/music/${encodeURIComponent(s.filename)}`         : '';
  audioOrig.src = s.originalFilename ? `/music/${encodeURIComponent(s.originalFilename)}` : '';
  audioAI.load();
  if (s.originalFilename) audioOrig.load();

  document.getElementById('hnp-num').textContent    = `${index + 1} / ${songs.length}`;
  document.getElementById('hnp-title').textContent  = s.title  || s.filename;
  document.getElementById('hnp-artist').textContent = s.artist || '';
  document.getElementById('host-lyrics').textContent = s.lyrics || '(가사 없음)';
  document.getElementById('btn-mode-orig').disabled = !s.originalFilename;

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
  const audio = activeAudio();
  if (isPlaying) {
    audio.pause();
    btnPlay.textContent = '▶';
    isPlaying = false;
    socket.emit('host:pause', { currentTime: audio.currentTime });
  } else {
    audio.play();
    btnPlay.textContent = '⏸';
    isPlaying = true;
    socket.emit('host:play', { currentTime: audio.currentTime });
  }
}

function prevSong() { if (songs.length) loadSong((currentIndex - 1 + songs.length) % songs.length, isPlaying); }
function nextSong() { if (songs.length) loadSong((currentIndex + 1) % songs.length, isPlaying); }

// ─── 모드 전환 (AI ↔ 원곡) ───
function setMode(mode) {
  const wasPlaying = isPlaying;
  const time = activeAudio().currentTime;

  if (isPlaying) activeAudio().pause();
  currentMode = mode;

  document.getElementById('btn-mode-ai').classList.toggle('active', mode === 'ai');
  document.getElementById('btn-mode-orig').classList.toggle('active', mode === 'original');

  const newAudio = activeAudio();
  newAudio.currentTime = time;
  if (wasPlaying) {
    newAudio.play();
    socket.emit('host:play', { currentTime: time });
  }

  socket.emit('host:mode', { mode });
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
function activeAudioSetup(audio) {
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration || audio !== activeAudio()) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressBar.value = pct;
    progressBar.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--card) ${pct}%)`;
    timeCurrent.textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener('loadedmetadata', () => {
    if (audio === activeAudio()) timeTotal.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('ended', () => {
    if (audio === activeAudio()) { isPlaying = false; btnPlay.textContent = '▶'; }
  });
}

activeAudioSetup(audioAI);
activeAudioSetup(audioOrig);

function seekAudio(val) {
  const audio = activeAudio();
  if (audio.duration) {
    audio.currentTime = (val / 100) * audio.duration;
    socket.emit('host:seek', { time: audio.currentTime });
  }
}

function formatTime(s) {
  if (isNaN(s)) return '0:00';
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
  const fileAI   = document.getElementById('upload-file').files[0];
  const fileOrig = document.getElementById('upload-orig').files[0];
  const title    = document.getElementById('input-title').value.trim();
  const artist   = document.getElementById('input-artist').value.trim();
  const hint     = document.getElementById('input-hint').value.trim();
  const lyrics   = document.getElementById('input-lyrics').value.trim();

  if (!fileAI)    return alert('AI 버전 MP3를 선택해주세요!');
  if (!title)     return alert('곡 제목을 입력해주세요!');

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append('mp3', file);
    const r = await fetch('/api/upload', { method:'POST', body: fd });
    return (await r.json()).filename;
  }

  const filename = await uploadFile(fileAI);
  const originalFilename = fileOrig ? await uploadFile(fileOrig) : '';

  await fetch('/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, originalFilename, title, artist, hint, lyrics })
  });

  ['upload-file','upload-orig','input-title','input-artist','input-hint','input-lyrics'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
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
