#!/usr/bin/env bash
#
# macOS 서명·공증용 GitHub Secrets 인코딩 헬퍼.
# 인증서(.p12)와 App Store Connect API 키(.p8)를 받아, GitHub Secrets에 그대로
# 붙여넣을 base64 값을 출력한다. (BUILD-MAC.md §8 참고)
#
# 사용:
#   tools/mac-secrets-encode.sh <경로/cert.p12> <경로/AuthKey_XXXX.p8>
#
# ⚠️ 출력값은 비밀이다. 파일로 저장하거나 커밋하지 말 것 — 터미널에서 바로 복사해
#    GitHub → Settings → Secrets and variables → Actions 에 붙여넣는다.
#    .p12/.p8 원본도 레포에 두지 말 것(.gitignore로 이미 차단됨).
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "사용법: $0 <cert.p12> <AuthKey_XXXX.p8>" >&2
  exit 1
fi

P12="$1"
P8="$2"

for f in "$P12" "$P8"; do
  [ -f "$f" ] || { echo "파일 없음: $f" >&2; exit 1; }
done

# 개행 없는 단일 라인 base64 (macOS BSD base64 / GNU base64 양쪽 호환).
b64() { base64 < "$1" | tr -d '\n'; }

echo "════════════════════════════════════════════════════════════════"
echo " GitHub Secrets — 아래 이름/값을 그대로 등록하세요"
echo " (Settings → Secrets and variables → Actions → New repository secret)"
echo "════════════════════════════════════════════════════════════════"
echo
echo "① MAC_CSC_LINK  (인증서 .p12 base64):"
echo "----------------------------------------------------------------"
b64 "$P12"; echo
echo "----------------------------------------------------------------"
echo
echo "② APPLE_API_KEY_BASE64  (API 키 .p8 base64):"
echo "----------------------------------------------------------------"
b64 "$P8"; echo
echo "----------------------------------------------------------------"
echo
echo "③ 아래 3개는 직접 입력값:"
echo "   MAC_CSC_KEY_PASSWORD  = .p12 내보낼 때 정한 비밀번호"
echo "   APPLE_API_KEY_ID      = API 키 ID (예: ABC123DEF4)"
echo "   APPLE_API_ISSUER      = Issuer ID (App Store Connect → Integrations)"
echo
echo "등록 후: Actions 탭 → build-mac → Run workflow (또는 v* 태그 push)"
echo "→ 서명+공증된 dmg가 나옵니다."
