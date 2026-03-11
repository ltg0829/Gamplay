// ═══════════════════════════════════════════════════════
//  NEXUS GAMES — 통합 서버  server.js
//  Express + WebSocket
//  ├ REST API  : 회원가입 / 로그인 / 중복확인 / 통계
//  └ WebSocket : 체스 온라인 대전 (오리지널 + 라인체스)
// ═══════════════════════════════════════════════════════

const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const fs       = require('fs');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-games-secret-change-in-production';
const DB_PATH    = path.join(__dirname, 'public', 'Data', 'users.json');

// ── Middleware ────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── JSON DB ───────────────────────────────────────────
function loadDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Auth Middleware ───────────────────────────────────
function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ message: '인증이 필요합니다' });
  try { req.userId = jwt.verify(h.split(' ')[1], JWT_SECRET).id; next(); }
  catch { res.status(401).json({ message: '유효하지 않은 토큰입니다' }); }
}

// ════════════════════════════════════════════════════════
//  REST API
// ════════════════════════════════════════════════════════

// 서버 상태
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 오늘의 케이스
app.get('/api/puzzle/today', (req, res) => {
  try {
    const casesPath = path.join(__dirname, 'public', 'Data', 'cases.json');
    if (!fs.existsSync(casesPath)) return res.status(404).json({ message: 'cases.json 없음' });
    const raw   = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));
    const cases = Array.isArray(raw) ? raw : (raw.cases || []);
    if (!cases.length) return res.status(404).json({ message: '사건 없음' });
    const idx  = Math.floor(Date.now() / 86400000) % cases.length;
    res.json({ case: cases[idx] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 정답 확인
app.post('/api/puzzle/solve', (req, res) => {
  try {
    const { caseId, answer } = req.body;
    const casesPath = path.join(__dirname, 'public', 'Data', 'cases.json');
    const raw   = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));
    const cases = Array.isArray(raw) ? raw : (raw.cases || []);
    const c     = cases.find(x => String(x.caseId) === String(caseId));
    if (!c) return res.status(404).json({ message: '사건 없음' });
    const correct = String(answer) === String(c.answer);
    res.json({ correct, explanation: c.explanation || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 중복 확인
app.get('/api/check-duplicate', (req, res) => {
  const { field, value } = req.query;
  if (!['id', 'nickname'].includes(field)) return res.status(400).json({ message: '잘못된 필드' });
  const db = loadDB();
  const exists = db.users.some(u => u[field] === value);
  res.json({ available: !exists });
});

// 회원가입
app.post('/api/register', async (req, res) => {
  const { id, nickname, password } = req.body;
  if (!id || !nickname || !password) return res.status(400).json({ message: '모든 필드를 입력해주세요' });
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(id)) return res.status(400).json({ message: 'ID는 영문·숫자·_로 4~20자' });
  if (nickname.length < 2 || nickname.length > 12) return res.status(400).json({ message: '닉네임은 2~12자' });
  if (password.length < 8) return res.status(400).json({ message: '비밀번호는 8자 이상' });

  const db = loadDB();
  if (db.users.some(u => u.id === id))       return res.status(409).json({ message: '이미 사용 중인 아이디입니다' });
  if (db.users.some(u => u.nickname === nickname)) return res.status(409).json({ message: '이미 사용 중인 닉네임입니다' });

  const hashed = await bcrypt.hash(password, 12);
  db.users.push({ id, nickname, password: hashed, createdAt: new Date().toISOString(),
    stats: { totalGames: 0, totalWins: 0, chessWins: 0, playDays: 0, lastPlayDate: null } });
  saveDB(db);
  console.log(`[REGISTER] ${id} (${nickname})`);
  res.status(201).json({ message: '회원가입 완료' });
});

// 로그인
app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요' });

  const db = loadDB();
  const user = db.users.find(u => u.id === id);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다' });

  const today = new Date().toDateString();
  if (user.stats.lastPlayDate !== today) {
    user.stats.playDays = (user.stats.playDays || 0) + 1;
    user.stats.lastPlayDate = today;
    saveDB(db);
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  console.log(`[LOGIN] ${id}`);
  res.json({ token, user: { id: user.id, nickname: user.nickname } });
});

// 통계 조회
app.get('/api/stats', authRequired, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ message: '사용자 없음' });
  const s = user.stats;
  const totalGames = s.totalGames || 0;
  const totalWins  = s.totalWins  || 0;
  res.json({
    totalGames, totalWins,
    chessWins : s.chessWins || 0,
    winRate   : totalGames > 0 ? Math.round(totalWins / totalGames * 100) + '%' : '0%',
    playDays  : s.playDays  || 0,
    onlinePlayers: db.users.length,
  });
});

// 통계 업데이트
app.post('/api/stats/update', authRequired, (req, res) => {
  const { game, result } = req.body;
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === req.userId);
  if (idx === -1) return res.status(404).json({ message: '사용자 없음' });
  const s = db.users[idx].stats;
  s.totalGames = (s.totalGames || 0) + 1;
  if (result === 'win') { s.totalWins = (s.totalWins || 0) + 1; if (game === 'chess') s.chessWins = (s.chessWins || 0) + 1; }
  saveDB(db);
  res.json({ message: '통계 업데이트 완료' });
});

// SPA 페이지 라우팅
app.get('/page/*', (req, res) => {
  const file = path.join(__dirname, 'public', req.path);
  res.sendFile(file, err => { if (err) res.status(404).send('Not found'); });
});

// catch-all — 로그인 페이지
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ════════════════════════════════════════════════════════
//  WEBSOCKET — 체스 온라인 대전
// ════════════════════════════════════════════════════════

const rooms = new Map(); // code → { white, black, gameType }

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

function wsSend(ws, data) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

wss.on('connection', ws => {
  ws.roomCode = null;
  ws.color    = null;
  ws.nickname = '플레이어';

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'create': {
        const code = generateCode();
        rooms.set(code, { white: ws, black: null, gameType: msg.gameType || 'classic' });
        ws.roomCode = code;
        ws.color    = 'white';
        if (msg.nickname) ws.nickname = msg.nickname;
        wsSend(ws, { type: 'room_created', code });
        console.log(`[ROOM] 생성: ${code} (${msg.gameType})`);
        break;
      }

      case 'join': {
        const code = msg.code?.toUpperCase();
        const room = rooms.get(code);
        if (!room)       { wsSend(ws, { type: 'error', message: '존재하지 않는 방입니다' }); return; }
        if (room.black)  { wsSend(ws, { type: 'error', message: '방이 가득 찼습니다' }); return; }
        room.black  = ws;
        ws.roomCode = code;
        ws.color    = 'black';
        if (msg.nickname) ws.nickname = msg.nickname;
        wsSend(room.white, { type: 'game_start', color: 'white', opponent: ws.nickname,       code, gameType: room.gameType });
        wsSend(room.black, { type: 'game_start', color: 'black', opponent: room.white.nickname, code, gameType: room.gameType });
        console.log(`[ROOM] 시작: ${code}`);
        break;
      }

      case 'move': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        const opp = ws.color === 'white' ? room.black : room.white;
        wsSend(opp, { type: 'move', move: msg.move });
        break;
      }

      case 'linepush': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        const opp = ws.color === 'white' ? room.black : room.white;
        wsSend(opp, { type: 'linepush', pushType: msg.pushType, index: msg.index, dir: msg.dir });
        break;
      }

      case 'chat': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        const opp = ws.color === 'white' ? room.black : room.white;
        wsSend(opp, { type: 'chat', text: msg.text, from: ws.nickname });
        break;
      }

      case 'resign': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        const opp = ws.color === 'white' ? room.black : room.white;
        wsSend(opp, { type: 'opponent_resigned' });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const opp = ws.color === 'white' ? room.black : room.white;
    wsSend(opp, { type: 'opponent_left' });
    rooms.delete(ws.roomCode);
    console.log(`[ROOM] 종료: ${ws.roomCode}`);
  });
});

// ── 시작 ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         NEXUS GAMES SERVER               ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  주소 : http://localhost:${PORT}             ║`);
  console.log(`║  WS   : ws://localhost:${PORT}               ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
