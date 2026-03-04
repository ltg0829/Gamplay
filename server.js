// ═══════════════════════════════════════════════════════
//  NEXUS GAMES — 통합 서버  server.js (MongoDB 기반)
// ═══════════════════════════════════════════════════════

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const path      = require('path');
const mongoose  = require('mongoose');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ── 환경 설정 ──────────────────────────────────────────
// Render는 내부적으로 10000 포트를 사용하므로 기본값을 변경했습니다.
const PORT       = process.env.PORT || 10000; 
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-games-secret-key';
const MONGO_URI  = process.env.MONGO_URI || 'mongodb+srv://jebag0828_db_user:yPMTXL0OFm6QPHkZ@cluster0.hutwijf.mongodb.net/nexus_games?retryWrites=true&w=majority&appName=Cluster0';

// ── MongoDB 연결 ───────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB 연결 성공!'))
  .catch(err => console.error('❌ MongoDB 연결 실패:', err));

// ── 데이터 모델(Schema) 정의 ───────────────────────────
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  nickname: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  stats: {
    totalGames: { type: Number, default: 0 },
    totalWins: { type: Number, default: 0 },
    chessWins: { type: Number, default: 0 },
    playDays: { type: Number, default: 0 },
    lastPlayDate: { type: String, default: null }
  }
});

const User = mongoose.model('User', userSchema);

// ── Middleware ────────────────────────────────────────
app.use(express.json());
// public 폴더 안의 정적 파일(이미지, CSS, JS)을 자동으로 제공합니다.
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Middleware ───────────────────────────────────
function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ message: '인증이 필요합니다' });
  try { 
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET);
    req.userId = decoded.id; 
    next(); 
  } catch { 
    res.status(401).json({ message: '유효하지 않은 토큰입니다' }); 
  }
}

// ════════════════════════════════════════════════════════
//  REST API
// ════════════════════════════════════════════════════════

// [중요] 메인 페이지 접속 시 index.html을 강제로 보내주는 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 중복 확인
app.get('/api/check-duplicate', async (req, res) => {
  const { field, value } = req.query;
  if (!['id', 'nickname'].includes(field)) return res.status(400).json({ message: '잘못된 필드' });
  
  const query = {};
  query[field] = value;
  const exists = await User.findOne(query);
  res.json({ available: !exists });
});

// 회원가입
app.post('/api/register', async (req, res) => {
  const { id, nickname, password } = req.body;
  if (!id || !nickname || !password) return res.status(400).json({ message: '모든 필드를 입력해주세요' });

  try {
    const hashed = await bcrypt.hash(password, 12);
    const newUser = new User({ id, nickname, password: hashed });
    await newUser.save();
    
    console.log(`[REGISTER] ${id} (${nickname})`);
    res.status(201).json({ message: '회원가입 완료' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: '이미 사용 중인 아이디 또는 닉네임입니다' });
    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// 로그인
app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
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
});

// 통계 조회
app.get('/api/stats', authRequired, async (req, res) => {
  const user = await User.findOne({ id: req.userId });
  if (!user) return res.status(404).json({ message: '사용자 없음' });
  
  const s = user.stats;
  const totalUsers = await User.countDocuments();
  
  res.json({
    totalGames: s.totalGames,
    totalWins: s.totalWins,
    chessWins: s.chessWins,
    winRate: s.totalGames > 0 ? Math.round(s.totalWins / s.totalGames * 100) + '%' : '0%',
    playDays: s.playDays,
    onlinePlayers: totalUsers,
  });
});

// 통계 업데이트
app.post('/api/stats/update', authRequired, async (req, res) => {
  const { game, result } = req.body;
  const user = await User.findOne({ id: req.userId });
  if (!user) return res.status(404).json({ message: '사용자 없음' });

  user.stats.totalGames += 1;
  if (result === 'win') {
    user.stats.totalWins += 1;
    if (game === 'chess') user.stats.chessWins += 1;
  }
  await user.save();
  res.json({ message: '통계 업데이트 완료' });
});

// 상세 페이지 라우팅 (index.html로 대응)
app.get('/pages/*', (req, res) => {
  const file = path.join(__dirname, 'public', req.path);
  res.sendFile(file, err => { 
    if (err) {
      res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

// ════════════════════════════════════════════════════════
//  WEBSOCKET — 체스 온라인 대전
// ════════════════════════════════════════════════════════

const rooms = new Map();

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
        break;
      }

      case 'join': {
        const code = msg.code?.toUpperCase();
        const room = rooms.get(code);
        if (!room) { wsSend(ws, { type: 'error', message: '존재하지 않는 방입니다' }); return; }
        if (room.black) { wsSend(ws, { type: 'error', message: '방이 가득 찼습니다' }); return; }
        room.black = ws;
        ws.roomCode = code;
        ws.color = 'black';
        if (msg.nickname) ws.nickname = msg.nickname;
        wsSend(room.white, { type: 'game_start', color: 'white', opponent: ws.nickname, code, gameType: room.gameType });
        wsSend(room.black, { type: 'game_start', color: 'black', opponent: room.white.nickname, code, gameType: room.gameType });
        break;
      }

      case 'move':
      case 'linepush':
      case 'chat':
      case 'resign': {
        const room = rooms.get(ws.roomCode); if (!room) return;
        const opp = ws.color === 'white' ? room.black : room.white;
        wsSend(opp, msg);
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
  });
});

// ── 시작 ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 NEXUS GAMES SERVER ON PORT ${PORT}\n`);
});