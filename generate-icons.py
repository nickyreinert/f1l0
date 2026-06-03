#!/usr/bin/env python3
"""Generate pixel art PNG icons from a 16x16 grid using only stdlib."""
import struct, zlib, os

# ── Pixel art design: 2-tier pine tree ──────────────────────────────────────
#  0 = background  1 = bright lime canopy  2 = brown trunk  3 = dark lime canopy
GRID = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],  # tip
    [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],  # upper tier (brightest)
    [0,0,0,0,0,3,3,3,3,3,0,0,0,0,0,0],
    [0,0,0,0,3,3,3,3,3,3,3,0,0,0,0,0],  # lower tier
    [0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0],  # trunk
    [0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0],  # base
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

PALETTE = {
    0: (17,  17,  17 ),   # #111 background
    1: (184, 245, 0  ),   # #b8f500 bright lime
    2: (139, 94,  60 ),   # #8b5e3c brown trunk
    3: (106, 191, 0  ),   # #6abf00 darker lime
}

def write_png(path, pixels, w, h):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''.join(
        b'\x00' + b''.join(bytes(px) for px in row)
        for row in pixels
    )
    png  = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

def scale(grid, size):
    s = size // 16
    rows = []
    for row in grid:
        prow = [PALETTE[v] for v in row for _ in range(s)]
        for _ in range(s):
            rows.append(prow)
    return rows

os.chdir(os.path.dirname(os.path.abspath(__file__)))

sizes = {
    'favicon-32.png':       32,
    'icon-192.png':        192,
    'apple-touch-icon.png':192,   # iOS uses this; 192 is fine
    'icon-512.png':        512,
}

for name, size in sizes.items():
    write_png(name, scale(GRID, size), size, size)
    print(f'  ✓ {name} ({size}x{size})')

print('Done.')
