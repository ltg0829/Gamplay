const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexus-games-secret-change-in-production';
const DB_PATH = path.join(__dirname, '../data/users.json');

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Simple JSON "Database" ──────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Auth Middleware ─────────────────────────────────────────
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '인증이 필요합니다' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다' });
  }
}

// ── Routes ──────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check duplicate (ID or nickname)
app.get('/api/check-duplicate', (req, res) => {
  const { field, value } = req.query;

  if (!field || !value) {
    return res.status(400).json({ message: '필드와 값이 필요합니다' });
  }

  if (!['id', 'nickname'].includes(field)) {
    return res.status(400).json({ message: '올바르지 않은 필드입니다' });
  }

  const db = loadDB();
  const exists = db.users.some(u =>
    field === 'id'
      ? u.id === value
      : u.nickname === value
  );

  res.json({ available: !exists });
});

// Register
app.post('/api/register', async (req, res) => {
  const { id, nickname, password } = req.body;

  // Validation
  if (!id || !nickname || !password) {
    return res.status(400).json({ message: '모든 필드를 입력해주세요' });
  }

  if (!/^[a-zA-Z0-9_]{4,20}$/.test(id)) {
    return res.status(400).json({ message: 'ID는 영문, 숫자, _로 4~20자여야 합니다' });
  }

  if (nickname.length < 2 || nickname.length > 12) {
    return res.status(400).json({ message: '닉네임은 2~12자여야 합니다' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: '비밀번호는 8자 이상이어야 합니다' });
  }

  const db = loadDB();

  // Duplicate check
  if (db.users.some(u => u.id === id)) {
    return res.status(409).json({ message: '이미 사용 중인 아이디입니다' });
  }

  if (db.users.some(u => u.nickname === nickname)) {
    return res.status(409).json({ message: '이미 사용 중인 닉네임입니다' });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  const newUser = {
    id,
    nickname,
    password: hashedPassword,
    createdAt: new Date().toISOString(),
    stats: {
      totalGames: 0,
      totalWins: 0,
      chessWins: 0,
      playDays: 0,
      lastPlayDate: null,
    }
  };

  db.users.push(newUser);
  saveDB(db);

  console.log(`[REGISTER] New user: ${id} (${nickname})`);
  res.status(201).json({ message: '회원가입이 완료되었습니다' });
});

// Login
app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;

  if (!id || !password) {
    return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요' });
  }

  const db = loadDB();
  const user = db.users.find(u => u.id === id);

  if (!user) {
    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다' });
  }

  // Update play days
  const today = new Date().toDateString();
  if (user.stats.lastPlayDate !== today) {
    user.stats.playDays = (user.stats.playDays || 0) + 1;
    user.stats.lastPlayDate = today;
    saveDB(db);
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

  console.log(`[LOGIN] User logged in: ${id}`);

  res.json({
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
    }
  });
});

// Get stats (auth required)
app.get('/api/stats', authRequired, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.userId);

  if (!user) {
    return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
  }

  const s = user.stats;
  const totalGames = s.totalGames || 0;
  const totalWins = s.totalWins || 0;
  const winRate = totalGames > 0
    ? Math.round((totalWins / totalGames) * 100) + '%'
    : '0%';

  res.json({
    totalGames,
    totalWins,
    chessWins: s.chessWins || 0,
    winRate,
    playDays: s.playDays || 0,
    onlinePlayers: db.users.length, // simplified "online" count
  });
});

// Update stats (auth required) - called by game logic
app.post('/api/stats/update', authRequired, (req, res) => {
  const { game, result } = req.body; // result: 'win' | 'loss' | 'draw'
  const db = loadDB();
  const userIdx = db.users.findIndex(u => u.id === req.userId);

  if (userIdx === -1) {
    return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
  }

  const stats = db.users[userIdx].stats;
  stats.totalGames = (stats.totalGames || 0) + 1;
  if (result === 'win') {
    stats.totalWins = (stats.totalWins || 0) + 1;
    if (game === 'chess') stats.chessWins = (stats.chessWins || 0) + 1;
  }

  saveDB(db);
  res.json({ message: '통계가 업데이트되었습니다' });
});

// SPA fallback for pages
app.get('/pages/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', req.path));
});

// 404
app.use((req, res) => {
  res.status(404).json({ message: '찾을 수 없는 경로입니다' });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║          NEXUS GAMES SERVER            ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  URL   : http://localhost:${PORT}          ║`);
  console.log(`║  Status: Running                       ║`);
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});
