# dotk

GitHub Private Repo를 저장소로 사용하는 시크릿 관리 도구.
별도 DB나 호스팅 없이, ECIES 비대칭키 암호화로 팀의 환경변수를 안전하게 관리합니다.

## 특징

- **GitHub Private Repo가 곧 저장소** — 별도 인프라 불필요
- **ECIES 비대칭키 암호화** — 값마다 독립 암호화, 한 값이 유출되어도 다른 값은 안전
- **CLI + 웹 UI** — 터미널과 브라우저 모두 지원
- **팀 협업** — push/pull로 동기화, 변경 시 공유 메시지 자동 생성
- **Webhook 알림** — Slack/Discord 연동 (선택)

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/olivecode/dotk/main/install.sh | sh
```

Node.js 18+ 와 Git이 필요합니다.

설치 후 셸을 재시작하거나:
```bash
export PATH="$HOME/.dotk/bin:$PATH"
```

### 소스에서 빌드 (개발용)

```bash
git clone <this-repo>
cd dotk
pnpm install
pnpm bundle    # dist/dotk 단일 파일 생성
```

## 빠른 시작

### 1. Vault 초기화

GitHub에 private repo를 하나 만든 뒤 (예: `my-org/secrets-vault`):

```bash
# 새 vault 생성 + GitHub repo 연결 (한 번에)
dotk init --remote git@github.com:my-org/secrets-vault.git
```

팀원이 합류할 때:
```bash
# 기존 vault 클론
dotk init --repo git@github.com:my-org/secrets-vault.git
```

remote 없이 로컬에서만 시작할 수도 있습니다:
```bash
dotk init
# → 나중에 GitHub repo를 연결하는 가이드가 출력됩니다
```

`init`을 실행하면:
- `dotk.toml` 설정 파일 생성
- `.keys/vault.key` (개인키), `.keys/vault.pub` (공개키) 생성
- `.gitignore`에 `.keys/` 자동 추가 — **개인키는 절대 git에 올라가지 않음**

### 2. 시크릿 저장

```bash
dotk set <서비스> <환경> <KEY=VALUE>
```

```bash
dotk set api-server production DATABASE_URL=postgres://prod-db:5432/main
dotk set api-server production API_KEY=sk-live-abc123
dotk set web-app production NEXT_PUBLIC_API=https://api.example.com
```

### 3. 시크릿 조회

```bash
dotk get api-server production DATABASE_URL
# → postgres://prod-db:5432/main
```

### 4. 팀과 동기화

```bash
# 변경사항 push
dotk push

# 출력 예시:
# ✓ Changes pushed to remote.
#
# Share with your team:
#   dotk: secrets updated
#   api-server/production — added DATABASE_URL, API_KEY
#   web-app/production — added NEXT_PUBLIC_API
#   → team members: run "dotk pull" to sync
```

팀원은 `dotk pull`로 최신 상태를 받습니다:

```bash
dotk pull

# ✓ Pulled latest changes.
#
# Updated secrets:
#   api-server/production — added DATABASE_URL, API_KEY
```

### 5. 애플리케이션 실행

복호화된 환경변수를 자식 프로세스에 주입합니다.

```bash
dotk run api-server production -- node server.js
dotk run api-server production -- docker compose up
```

### 6. .env 파일로 내보내기

```bash
dotk export api-server production
# DATABASE_URL=postgres://prod-db:5432/main
# API_KEY=sk-live-abc123

# 파일로 저장
dotk export api-server production > .env
```

## 명령어 목록

| 명령어 | 설명 |
|--------|------|
| `dotk init` | 새 vault 초기화 또는 기존 vault 클론 |
| `dotk keygen` | ECIES 키페어 재생성 |
| `dotk set <svc> <env> <K=V>` | 시크릿 암호화 후 저장 |
| `dotk get <svc> <env> <key>` | 시크릿 복호화 후 출력 |
| `dotk run <svc> <env> -- <cmd>` | 환경변수 주입 후 명령 실행 |
| `dotk push` | 변경사항 커밋 & 푸시 + 변경 요약 출력 |
| `dotk pull` | 최신 변경사항 가져오기 + 변경 요약 출력 |
| `dotk diff` | 변경된 파일 목록 표시 |
| `dotk export <svc> <env>` | .env 포맷으로 내보내기 |
| `dotk ui` | 웹 UI 실행 (http://127.0.0.1:5555) |

모든 명령어에 `--vault <dir>` 옵션을 추가하면 다른 디렉터리의 vault를 사용할 수 있습니다.
`DOTK_VAULT` 환경변수로도 설정 가능합니다.

## Vault 디렉터리 구조

```
my-secrets/
├── .keys/                              ← .gitignore (git에 올라가지 않음)
│   ├── vault.key                       ← 개인키
│   └── vault.pub                       ← 공개키
├── services/
│   ├── api-server/
│   │   ├── .env.development.encrypted
│   │   ├── .env.staging.encrypted
│   │   └── .env.production.encrypted
│   └── web-app/
│       └── .env.production.encrypted
└── dotk.toml
```

## 설정 파일 (dotk.toml)

```toml
[vault]
version = 1

[services.api-server]
description = "Backend API"
environments = ["development", "staging", "production"]

[services.web-app]
description = "Next.js frontend"
environments = ["development", "production"]

[members.john]
public_key = "04a1b2c3d4..."
role = "admin"

[settings]
default_environment = "development"

# 선택: push 시 Slack/Discord 알림
[hooks]
post_push_url = "https://hooks.slack.com/services/T.../B.../xxx"
```

## Webhook 알림 설정

`dotk push` 시 Slack이나 Discord로 자동 알림을 보낼 수 있습니다.

**Slack:**
```toml
[hooks]
post_push_url = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

**Discord:**
```toml
[hooks]
post_push_url = "https://discord.com/api/webhooks/YOUR/WEBHOOK/URL"
```

알림 예시:
```
🔑 dotk secrets updated
  api-server/production — added DATABASE_URL, API_KEY
  web-app/staging — updated CDN_URL
```

## 웹 UI

```bash
dotk ui
# ✓ UI running at http://127.0.0.1:5555
```

브라우저에서 시크릿 조회, 추가, 삭제를 할 수 있습니다.
보안을 위해 `127.0.0.1`에만 바인딩되어 외부에서 접근할 수 없습니다.

포트 변경:
```bash
dotk ui --port 8080
```

## CI/CD 연동

CI 환경에서는 개인키를 환경변수로 전달합니다.

```yaml
# GitHub Actions 예시
jobs:
  deploy:
    steps:
      - uses: actions/checkout@v4

      - name: Clone secrets vault
        run: git clone git@github.com:my-org/secrets-vault.git ./secrets

      - name: Deploy with secrets
        env:
          DOTK_PRIVATE_KEY: ${{ secrets.DOTK_PRIVATE_KEY }}
        run: dotk run api-server production --vault ./secrets -- ./deploy.sh
```

## Docker에서 사용

`get`, `run`, `export` 명령어는 **Git 없이 동작**합니다.
vault 파일만 복사하면 됩니다.

```dockerfile
FROM node:22-slim

# Git 설치 불필요
COPY secrets/ /app/secrets/
COPY dist/dotk /usr/local/bin/dotk

# 방법 1: .env 파일 생성
RUN dotk export api-server production --vault /app/secrets > /app/.env

# 방법 2: 환경변수 주입하여 직접 실행
ENV DOTK_PRIVATE_KEY=${DOTK_PRIVATE_KEY}
CMD ["dotk", "run", "api-server", "production", "--vault", "/app/secrets", "--", "node", "server.js"]
```

`docker build` 시 개인키 전달:
```bash
# 빌드 타임에 .env 생성하는 경우
docker build --build-arg DOTK_PRIVATE_KEY=$(cat .keys/vault.key) .

# 런타임에 주입하는 경우 (더 안전)
docker run -e DOTK_PRIVATE_KEY=$(cat .keys/vault.key) my-app
```

> **핵심**: `init`, `push`, `pull` 등 Git이 필요한 명령은 로컬/CI에서만 사용하고,
> Docker 컨테이너 안에서는 `get`, `run`, `export`만 사용하면 됩니다.

## 암호화 방식

- **알고리즘**: ECIES (Elliptic Curve Integrated Encryption Scheme) / secp256k1
- **특성**: 호출마다 임시 키 생성 → 같은 값도 매번 다른 ciphertext
- **포맷**: `encrypted:v1:<base64-ciphertext>`
- 공개키로 암호화, 개인키로만 복호화 가능

## 보안 주의사항

- `.keys/vault.key` 파일은 절대 공유하지 마세요
- 개인키를 분실하면 암호화된 시크릿을 복호화할 수 없습니다
- CI에서는 `DOTK_PRIVATE_KEY` 환경변수를 GitHub Secrets 등에 안전하게 보관하세요
- 웹 UI는 로컬에서만 접근 가능합니다 (`127.0.0.1` 바인딩)

## 개발

```bash
# 전체 빌드
pnpm build

# core 테스트
pnpm --filter @dotk/core test

# 개발 모드 (파일 변경 시 자동 빌드)
pnpm dev
```
