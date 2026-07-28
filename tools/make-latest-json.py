#!/usr/bin/env python3
"""
홈페이지 다운로드 카드용 latest.json 생성 — GitHub 릴리스에서 그대로 뽑는다.

앱의 업데이트 알림은 이 파일을 쓰지 않는다(앱은 GitHub를 직접 본다 — main/services/update.ts).
이 파일은 icenovel.com 서비스 페이지 하단의 기본 다운로드 카드에만 쓰인다.

사용:
    python tools/make-latest-json.py                  # 표준출력으로
    python tools/make-latest-json.py --write <경로>    # 파일로 저장

기본 저장 위치(로컬 사이트 소스가 있을 때):
    D:/Naver MYBOX/11. Business/icenovel.com/web/public/download/icefiction/latest.json
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

API = "https://api.github.com/repos/icenovel-rgb/ICEFiction/releases/latest"


def fetch_release() -> dict:
    req = urllib.request.Request(
        API, headers={"Accept": "application/vnd.github+json", "User-Agent": "ICEFiction"}
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))


def first_line(body: str) -> str:
    """
    릴리스 노트에서 사람이 읽을 한 줄만 — 마크다운 표시는 걷어낸다.

    CI가 --generate-notes 로 만든 릴리스는 본문이 "Full Changelog: <링크>" 뿐이다.
    그걸 그대로 다운로드 카드에 띄우면 사용자에게 아무 뜻이 없으므로 걸러낸다.
    """
    for raw in (body or "").splitlines():
        line = raw.lstrip("#>*- ").replace("**", "").strip()
        if len(line) <= 1 or line.startswith(("|", "---")):
            continue
        if line.lower().startswith(("full changelog", "what's changed", "http")):
            continue
        return line[:160]
    return ""


def build(rel: dict) -> dict:
    version = (rel.get("tag_name") or "").lstrip("v")
    if not version:
        raise SystemExit("릴리스 태그를 찾지 못했습니다.")
    date = (rel.get("published_at") or "")[:10]
    notes = first_line(rel.get("body") or "")

    out: dict[str, dict | None] = {"win": None, "mac": None}
    for asset in rel.get("assets", []):
        name = asset["name"].lower()
        key = "win" if name.endswith(".exe") else "mac" if name.endswith(".dmg") else None
        if not key:
            continue
        out[key] = {
            "version": version,
            "url": asset["browser_download_url"],
            "size_bytes": asset["size"],
            "date": date,
            "notes": notes,
        }
    if not any(out.values()):
        raise SystemExit(f"v{version} 릴리스에 exe·dmg 가 아직 없습니다(CI 빌드 중일 수 있음).")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", metavar="PATH", help="저장할 경로(없으면 표준출력)")
    args = ap.parse_args()

    data = build(fetch_release())
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"

    if args.write:
        with open(args.write, "w", encoding="utf-8") as f:
            f.write(text)
        ver = (data["win"] or data["mac"])["version"]
        missing = [k for k, v in data.items() if not v]
        # 윈도 콘솔(cp949)에서 깨지지 않도록 ASCII로만 알린다.
        msg = f"saved: {args.write} (v{ver})"
        if missing:
            msg += f" [missing: {', '.join(missing)}]"
        print(msg)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
