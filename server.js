const express   = require('express');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const path      = require('path');
const cors      = require('cors');
const http      = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const app    = express();
const server = http.createServer(app); // ← app.listen 대신 http.createServer 사용
const wss    = new WebSocket.Server({ server });
const PORT   = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-secret-key';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB 연결 ──────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB 연결 성공!'))
  .catch(err => console.error('❌ MongoDB 연결 실패:', err));

// ── User 스키마 ───────────────────────────────────────
const userSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  nickname:  { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  stats: {
    totalGames:   { type: Number, default: 0 },
    totalWins:    { type: Number, default: 0 },
    chessWins:    { type: Number, default: 0 },
    playDays:     { type: Number, default: 0 },
    lastPlayDate: { type: String, default: null },
  }
});
const User = mongoose.model('User', userSchema);

// ── Auth 미들웨어 ─────────────────────────────────────
function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ message: '인증이 필요합니다' });
  try {
    req.userId = jwt.verify(h.split(' ')[1], JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ message: '유효하지 않은 토큰입니다' });
  }
}

// ════════════════════════════════════════════════════════
//  API 라우트
// ════════════════════════════════════════════════════════

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// 중복 확인
app.get('/api/check-duplicate', async (req, res) => {
  const { field, value } = req.query;
  if (!['id', 'nickname'].includes(field))
    return res.status(400).json({ message: '잘못된 필드' });
  try {
    const query = field === 'id' ? { id: value } : { nickname: value };
    const exists = await User.findOne(query);
    res.json({ available: !exists });
  } catch {
    res.status(500).json({ message: '서버 오류' });
  }
});

// 회원가입
app.post('/api/register', async (req, res) => {
  const { id, nickname, password } = req.body;
  if (!id || !nickname || !password)
    return res.status(400).json({ message: '모든 필드를 입력해주세요' });
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(id))
    return res.status(400).json({ message: 'ID는 영문·숫자·_로 4~20자' });
  if (nickname.length < 2 || nickname.length > 12)
    return res.status(400).json({ message: '닉네임은 2~12자' });
  if (password.length < 8)
    return res.status(400).json({ message: '비밀번호는 8자 이상' });
  try {
    if (await User.findOne({ id }))       return res.status(409).json({ message: '이미 사용 중인 아이디입니다' });
    if (await User.findOne({ nickname })) return res.status(409).json({ message: '이미 사용 중인 닉네임입니다' });
    const hashed = await bcrypt.hash(password, 12);
    await User.create({ id, nickname, password: hashed });
    console.log(`[REGISTER] ${id} (${nickname})`);
    res.status(201).json({ message: '회원가입 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// 로그인
app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  if (!id || !password)
    return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요' });
  try {
    const user = await User.findOne({ id });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다' });
    const today = new Date().toDateString();
    if (user.stats.lastPlayDate !== today) {
      user.stats.playDays += 1;
      user.stats.lastPlayDate = today;
      await user.save();
    }
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    console.log(`[LOGIN] ${id}`);
    res.json({ token, user: { id: user.id, nickname: user.nickname } });
  } catch {
    res.status(500).json({ message: '서버 오류' });
  }
});

// 통계 조회
app.get('/api/stats', authRequired, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.userId });
    if (!user) return res.status(404).json({ message: '사용자 없음' });
    const s = user.stats;
    const totalGames    = s.totalGames || 0;
    const totalWins     = s.totalWins  || 0;
    const onlinePlayers = await User.countDocuments();
    res.json({
      totalGames, totalWins,
      chessWins:  s.chessWins || 0,
      winRate:    totalGames > 0 ? Math.round(totalWins / totalGames * 100) + '%' : '0%',
      playDays:   s.playDays  || 0,
      onlinePlayers,
    });
  } catch {
    res.status(500).json({ message: '서버 오류' });
  }
});

// 통계 업데이트
app.post('/api/stats/update', authRequired, async (req, res) => {
  const { game, result } = req.body;
  try {
    const user = await User.findOne({ id: req.userId });
    if (!user) return res.status(404).json({ message: '사용자 없음' });
    user.stats.totalGames += 1;
    if (result === 'win') {
      user.stats.totalWins += 1;
      if (game === 'chess') user.stats.chessWins += 1;
    }
    await user.save();
    res.json({ message: '통계 업데이트 완료' });
  } catch {
    res.status(500).json({ message: '서버 오류' });
  }
});

app.get('/api/character/status', (req, res) => {
  res.json({ charName: '지백', movePoint: 3, maxFloor: '1F', imageUrl: '/assets/char_default.png' });
});

// ════════════════════════════════════════════════════════
//  페이지 라우트
// ════════════════════════════════════════════════════════

app.get('/page/:file', (req, res) => {
  const file = path.join(__dirname, 'public', 'page', req.params.file);
  res.sendFile(file, err => { if (err) res.status(404).send('Not found'); });
});

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API를 찾을 수 없습니다.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ════════════════════════════════════════════════════════
//  WebSocket — 체스 온라인 대전
// ════════════════════════════════════════════════════════

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); }
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
        break;
      }
      case 'join': {
        const code = msg.code?.toUpperCase();
        const room = rooms.get(code);
        if (!room)      { wsSend(ws, { type: 'error', message: '존재하지 않는 방입니다' }); return; }
        if (room.black) { wsSend(ws, { type: 'error', message: '방이 가득 찼습니다' }); return; }
        room.black  = ws;
        ws.roomCode = code;
        ws.color    = 'black';
        if (msg.nickname) ws.nickname = msg.nickname;
        wsSend(room.white, { type: 'game_start', color: 'white', opponent: ws.nickname,         code, gameType: room.gameType });
        wsSend(room.black, { type: 'game_start', color: 'black', opponent: room.white.nickname, code, gameType: room.gameType });
        break;
      }
      case 'move': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        wsSend(ws.color === 'white' ? room.black : room.white, { type: 'move', move: msg.move });
        break;
      }
      case 'linepush': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        wsSend(ws.color === 'white' ? room.black : room.white, { type: 'linepush', pushType: msg.pushType, index: msg.index, dir: msg.dir });
        break;
      }
      case 'resign': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        wsSend(ws.color === 'white' ? room.black : room.white, { type: 'opponent_resigned' });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    wsSend(ws.color === 'white' ? room.black : room.white, { type: 'opponent_left' });
    rooms.delete(ws.roomCode);
  });
});

// ── 서버 시작 ─────────────────────────────────────────
// 반드시 server.listen() 사용 (app.listen() 아님!)
server.listen(PORT, () => console.log(`🚀 포트 ${PORT} 실행 중`));