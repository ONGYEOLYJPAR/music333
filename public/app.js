const socket = io();

let songs = [];
let currentMode = 'ai';
let confettiCanvas = document.getElementById('confetti-canvas');
let myConfetti = confetti.create(confettiCanvas, { resize: true, useWorker: true });

const audio    = document.getElementById('aud-audio');
const timerEl  = document.getElementById('audience-timer');
const timerNum = document.getElementById('timer-num');

// ─── 초기 데이터 로드 ───
async function loadSongs() {
  const r = await fetch('/api/songs');
  songs = await r.json();
}

// ─── 상태 동기화 (접속 시 현재 상태 받기) ───
socket.on('state:sync', async (state) => {
  await loadSongs();
  applyLoad({ songIndex: state.songIndex });
  applyReveal({ step: state.revealStep });
  applyMode({ mode: state.mode });
  if (state.timerRunning && state.timerSeconds > 0) applyTimer({ timerRunning: true, timerSeconds: state.timerSeconds });
});

// ─── 진행자 이벤트 수신 ───
socket.on('player:load',  applyLoad);
socket.on('player:play',  applyPlay);
socket.on('player:pause', applyPause);
socket.on('player:seek',  (d) => { audio.currentTime = d.time; });
socket.on('player:reveal', applyReveal);
socket.on('player:mode',   applyMode);
socket.on('player:timer',  applyTimer);
socket.on('player:hint',   applyLiveHint);

function applyLoad(d) {
  const s = songs[d.songIndex];
  if (!s) return;
  document.getElementById('aud-round').textContent = `Q ${d.songIndex + 1}`;
  const src = currentMode === 'ai'
    ? `/music/${encodeURIComponent(s.filename)}`
    : (s.originalFilename ? `/music/${encodeURIComponent(s.originalFilename)}` : `/music/${encodeURIComponent(s.filename)}`);
  audio.src = src;
  audio.load();
  applyReveal({ step: 0 });
}

function applyPlay(d) {
  audio.currentTime = d.currentTime || 0;
  audio.play().catch(() => {});
}

function applyPause(d) {
  audio.pause();
  audio.currentTime = d.currentTime || audio.currentTime;
}

function applyMode(d) {
  currentMode = d.mode;
  const badge = document.getElementById('aud-mode-badge');
  badge.classList.remove('hidden');
  badge.textContent = d.mode === 'ai' ? '🤖 AI 버전' : '🎵 원곡';

  const s = songs[/* currentIndex from state */ 0];
  // 현재 곡을 다시 로드해야 함 - 진행 중인 오디오 시간 유지
  const time = audio.currentTime;
  const wasPlaying = !audio.paused;
  // 서버에서 현재 곡 index를 받아와야 하므로 별도 처리 없이 서버가 관리
  if (wasPlaying) {
    audio.currentTime = time;
    audio.play().catch(() => {});
  }
}

// ─── 정답 공개 단계 ───
function applyReveal(d) {
  const step = d.step;
  // 서버가 reveal 이벤트에 곡 데이터를 실어보냄
  // fallback으로 로컬 songs 배열도 사용
  const s = d.song || (songs.length > 0 ? songs[window._currentSongIndex || 0] : null) || {};

  const mystery      = document.getElementById('aud-mystery');
  const hint         = document.getElementById('aud-hint');
  const artistReveal = document.getElementById('aud-artist-reveal');
  const answer       = document.getElementById('aud-answer');

  mystery.classList.add('hidden');
  hint.classList.add('hidden');
  artistReveal.classList.add('hidden');
  answer.classList.add('hidden');

  if (step === 0) {
    mystery.classList.remove('hidden');
  } else if (step === 1) {
    hint.classList.remove('hidden');
    document.getElementById('aud-hint-text').textContent = s.hint || '(힌트 없음)';
  } else if (step === 2) {
    artistReveal.classList.remove('hidden');
    document.getElementById('aud-artist-name').textContent = s.artist || '???';
  } else if (step === 3) {
    answer.classList.remove('hidden');
    document.getElementById('aud-answer-title').textContent  = s.title  || '???';
    document.getElementById('aud-answer-artist').textContent = s.artist || '';
    document.getElementById('aud-answer-lyrics').textContent = s.lyrics || '';
    fireConfetti();
  }
}

// ─── 타이머 ───
function applyTimer(d) {
  if (!d.timerRunning || d.timerSeconds <= 0) {
    timerEl.classList.add('hidden');
    timerEl.classList.remove('urgent');
    return;
  }
  timerEl.classList.remove('hidden');
  timerNum.textContent = d.timerSeconds;
  timerEl.classList.toggle('urgent', d.timerSeconds <= 10);
}

// ─── 실시간 힌트 ───
function applyLiveHint(d) {
  const banner = document.getElementById('live-hint-banner');
  const text   = document.getElementById('live-hint-text');
  if (!d.text) {
    banner.classList.add('hidden');
    return;
  }
  text.textContent = d.text;
  banner.classList.remove('hidden');
}

// ─── 진행 바 ───
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  document.getElementById('aud-fill').style.width = pct + '%';
  document.getElementById('aud-time-cur').textContent = fmt(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  document.getElementById('aud-time-tot').textContent = fmt(audio.duration);
});

function fmt(s) {
  if (isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

// ─── 폭죽 ───
function fireConfetti() {
  const count = 200;
  const defaults = { origin: { y: 0.7 } };

  function fire(particleRatio, opts) {
    myConfetti({ ...defaults, ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, { spread: 26, startVelocity: 55, colors: ['#7c3aed','#06b6d4','#fbbf24'] });
  fire(0.2,  { spread: 60, colors: ['#fbbf24','#f59e0b'] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#7c3aed','#22c55e'] });
  fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1,  { spread: 120, startVelocity: 45, colors: ['#06b6d4','#fbbf24'] });
}

// ─── state:sync에서 songIndex 저장 ───
socket.on('player:load', (d) => { window._currentSongIndex = d.songIndex; });
socket.on('state:sync',  (d) => { window._currentSongIndex = d.songIndex; });
