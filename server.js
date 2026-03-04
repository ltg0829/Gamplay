const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 미들웨어 설정
app.use(cors());
app.use(express.json());

// [중요] 2. 정적 파일 서빙 설정 (최상단 배치)
// public 폴더 안의 모든 파일(html, css, js)을 우선적으로 찾습니다.
app.use(express.static(path.join(__dirname, 'public')));

// 3. MongoDB 연결
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB 연결 성공!'))
  .catch(err => console.error('❌ MongoDB 연결 실패:', err));

// 4. API 라우트 (회원가입/로그인 등)
// app.use('/api/auth', authRoutes); // 기존에 설정하신 인증 라우트

// [중요] 5. 특정 페이지 경로 명시 (hub.html 접근 보장)
app.get('/pages/hub.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'hub.html'));
});

// 6. 로그라이크 캐릭터 데이터 API (기획하신 데이터 구조 예시)
app.get('/api/character/status', (req, res) => {
    // 임시 데이터 (나중에 DB 연결)
    res.json({
        charName: "지백",
        movePoint: 3,
        maxFloor: "15F",
        imageUrl: "/assets/char_warrior.png"
    });
});

// [중요] 7. 그 외 모든 요청 처리 (맨 마지막 배치)
// 주소창에 직접 경로를 입력하거나 파일을 찾지 못했을 때만 index.html을 보냅니다.
app.get('*', (req, res) => {
    // API 요청(/api/...)은 index.html을 보내지 않도록 예외 처리
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: "API 엔드포인트를 찾을 수 없습니다." });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
});