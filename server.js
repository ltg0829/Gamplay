const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
require('dotenv').config(); // 🔴 이 코드를 위해 위에서 npm install dotenv가 필요합니다.

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. 정적 파일 서빙 (public 폴더 기준)
app.use(express.static(path.join(__dirname, 'public')));

// 2. MongoDB 연결
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB 연결 성공!'))
  .catch(err => console.error('❌ MongoDB 연결 실패:', err));

// [중요] 3. 폴더명 'page'에 맞춘 경로 설정
app.get('/page/hub.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'page', 'hub.html'));
});

// 4. 로그라이크 캐릭터 데이터 API (기획하신 구조)
app.get('/api/character/status', (req, res) => {
    res.json({
        charName: "지백",
        movePoint: 3,
        maxFloor: "1F",
        imageUrl: "/assets/char_default.png"
    });
});

// 5. 그 외 모든 요청 처리
app.get('/pages/:file', (req, res) => {
  const file = path.join(__dirname, 'public', 'pages', req.params.file);
  res.sendFile(file, err => {
    if (err) res.status(404).send('Not found');
  });
});

// API 404
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API를 찾을 수 없습니다.' });
});

// 나머지 → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 서버가 실행 중입니다.`);
});