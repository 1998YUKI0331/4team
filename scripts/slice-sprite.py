#!/usr/bin/env python3
"""금갱이 스프라이트 시트 정리 스크립트 (일회성, Pillow 필요)

원본은 4x2 그리드에 8프레임이 들어 있는데
  - 셀 경계에 1px 짜리 파란 줄과 잔여 점들이 섞여 있고
  - 행마다 캐릭터의 세로 위치가 달라서 그대로 자르면 애니메이션이 튄다.
그래서 (1) 알파 임계값 + 작은 덩어리 제거로 잡티를 걷어내고,
(2) 프레임마다 "버튼 받침의 바닥 중앙"을 기준점으로 삼아 같은 크기로 잘라
가로 한 줄짜리 스트립으로 다시 만든다.

    python3 scripts/slice-sprite.py <원본.png> src/assets/geumgaengi-typing.webp
"""
import sys
from collections import deque

from PIL import Image

COLS, ROWS = 4, 2
ALPHA_MIN = 40  # 이보다 옅은 픽셀은 잔상으로 보고 버린다
MIN_BLOB = 2000  # 이보다 작은 덩어리는 잡티
FRAME_W, FRAME_H = 380, 476  # 잘라낼 창 크기 (가장 큰 프레임 + 여백)
OUT_H = 260  # 최종 프레임 높이 (표시 크기의 2배, 레티나 대응)


def clean(img):
    """옅은 픽셀과 작은 덩어리를 지운 알파 마스크를 돌려준다."""
    w, h = img.size
    px = img.load()
    strong = [[px[x, y][3] >= ALPHA_MIN for x in range(w)] for y in range(h)]

    keep = [[False] * w for _ in range(h)]
    seen = [[False] * w for _ in range(h)]
    for sy in range(h):
        for sx in range(w):
            if not strong[sy][sx] or seen[sy][sx]:
                continue
            q, blob = deque([(sx, sy)]), []
            seen[sy][sx] = True
            while q:
                x, y = q.popleft()
                blob.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and strong[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(blob) >= MIN_BLOB:
                for x, y in blob:
                    keep[y][x] = True
    return keep


def anchor(keep, x0, y0, x1, y1):
    """프레임 안에서 (바닥 y, 받침 중앙 x) 를 찾는다."""
    rows = [y for y in range(y0, y1) if any(keep[y][x] for x in range(x0, x1))]
    if not rows:
        return None
    bottom = rows[-1]
    base = rows[-max(1, len(rows) // 10):]  # 아래 10% = 버튼 받침
    xs = [x for y in base for x in range(x0, x1) if keep[y][x]]
    return bottom, (min(xs) + max(xs)) // 2


def main(src, dst):
    img = Image.open(src).convert('RGBA')
    W, H = img.size
    cw, chh = W // COLS, H // ROWS
    keep = clean(img)

    # 잡티를 지운 원본
    clear = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cp, op = clear.load(), img.load()
    for y in range(H):
        for x in range(W):
            if keep[y][x]:
                cp[x, y] = op[x, y]

    frames = []
    for r in range(ROWS):
        for c in range(COLS):
            x0, y0 = c * cw, r * chh
            got = anchor(keep, x0, y0, x0 + cw, y0 + chh)
            if not got:
                continue
            bottom, cx = got
            left = cx - FRAME_W // 2
            top = bottom - FRAME_H + 8  # 바닥에 살짝 여백
            frames.append(clear.crop((left, top, left + FRAME_W, top + FRAME_H)))

    scale = OUT_H / FRAME_H
    out_w = round(FRAME_W * scale)
    sheet = Image.new('RGBA', (out_w * len(frames), OUT_H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f.resize((out_w, OUT_H), Image.LANCZOS), (i * out_w, 0))
    if dst.endswith('.webp'):
        sheet.save(dst, 'WEBP', quality=88, method=6)
    else:
        sheet.save(dst, optimize=True)
    print(f'{len(frames)} frames -> {dst} ({sheet.size[0]}x{sheet.size[1]}, frame {out_w}x{OUT_H})')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
