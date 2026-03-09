# NEXUS GAMES — 설치 및 실행 가이드

## 📁 프로젝트 구조

```
nexus-games/
├── server/
│   └── index.js          # 백엔드 서버 (Express)
├── public/
│   └── data/
│       └── users.json         # 사용자 데이터 (자동 생성)
│   ├── index.html         # 로그인 / 회원가입 페이지
│   └── pages/
│       ├── crimescene.html  
│       ├── chess.html
│       └── hub.html       # 메인 게임 허브
├── package.json
└── README.md
```

---

## 🚀 설치 방법

### 1단계: Node.js 설치

서브컴퓨터에 Node.js가 없다면 설치하세요:
- 공식 사이트: https://nodejs.org
- 권장 버전: v18 이상 (LTS)

설치 확인:
```bash
node -v
npm -v
```

---

### 2단계: 프로젝트 폴더 설정

1. 이 `nexus-games` 폴더를 서브컴퓨터에 복사합니다
2. 터미널(CMD / PowerShell / Terminal)에서 폴더로 이동:

```bash
cd nexus-games
```

---

### 3단계: 패키지 설치

```bash
npm install
```

---

### 4단계: 서버 실행

```bash
npm start
```

실행 후 터미널에 이렇게 표시됩니다:
```
╔════════════════════════════════════════╗
║          NEXUS GAMES SERVER            ║
╠════════════════════════════════════════╣
║  URL   : http://localhost:3000         ║
║  Status: Running                       ║
╚════════════════════════════════════════╝
```

---

### 5단계: 접속

**같은 컴퓨터(로컬)에서 접속:**
```
http://localhost:3000
```

**다른 컴퓨터(같은 네트워크)에서 접속:**
1. 서버 컴퓨터의 IP 확인:
   - Windows: `ipconfig` → IPv4 주소 확인
   - Mac/Linux: `ifconfig` 또는 `ip addr`
2. 브라우저에서 접속: `http://[서버IP]:3000`
   - 예시: `http://192.168.1.10:3000`

---

## ⚙️ 개발 모드 (자동 재시작)

파일 수정 시 자동으로 서버가 재시작됩니다:

```bash
npm run dev
```

---

## 🔐 환경 변수 설정 (선택 사항)

보안을 위해 JWT 시크릿을 변경하는 것을 권장합니다:

**Windows (PowerShell):**
```powershell
$env:JWT_SECRET="나만의-비밀-키-여기에-입력"
$env:PORT=3000
npm start
```

**Mac / Linux:**
```bash
JWT_SECRET="나만의-비밀-키-여기에-입력" PORT=3000 npm start
```

---

## 📡 API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|-----------|
| GET | `/api/health` | 서버 상태 확인 | ❌ |
| GET | `/api/check-duplicate` | 아이디/닉네임 중복 확인 | ❌ |
| POST | `/api/register` | 회원가입 | ❌ |
| POST | `/api/login` | 로그인 | ❌ |
| GET | `/api/stats` | 내 통계 조회 | ✅ |
| POST | `/api/stats/update` | 게임 결과 업데이트 | ✅ |

---

## 🎮 게임 추가 방법

체스 또는 로그라이크 게임을 추가하려면:
1. `public/pages/` 폴더에 게임 HTML 파일 추가 (예: `chess.html`)
2. 게임 결과를 `/api/stats/update` API로 전송

게임 결과 전송 예시:
```javascript
// 게임 승리 시
await fetch('/api/stats/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  },
  body: JSON.stringify({ game: 'chess', result: 'win' })
});
```

---

## 🗄️ 데이터 저장소

사용자 데이터는 `data/users.json`에 JSON 형태로 저장됩니다.
비밀번호는 bcrypt로 해시되어 안전하게 저장됩니다.

> 나중에 사용자가 많아지면 MongoDB나 SQLite 같은 데이터베이스로 교체하는 것을 권장합니다.

---

## 🛠️ 문제 해결

**포트가 이미 사용 중인 경우:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID [PID번호] /F

# Mac/Linux
lsof -ti:3000 | xargs kill
```

**다른 포트로 실행:**
```bash
PORT=8080 npm start
```
