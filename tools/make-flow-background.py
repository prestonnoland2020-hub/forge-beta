"""Forge flow background: ribbons of fine parallel lines following a smooth,
swirling field, in two tone layers (mid and bright). Original procedural art;
output is two alpha-only SVGs used as CSS masks."""
import math, random, sys
W, H = 400, 900
AMP = float(sys.argv[3]) if len(sys.argv) > 3 else 3.4
random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 7)

# A folding field: angle from a few random sine waves, sampled through a
# domain warp, so the flow stretches and doubles back like marbled paint.
WAVES = [(random.uniform(0, math.tau), random.uniform(.006, .018), random.uniform(0, math.tau), random.uniform(.5, 1)) for _ in range(6)]
def noise(x, y, ws=WAVES):
    v = 0
    for th, f, ph, a in ws:
        v += a * math.sin((x*math.cos(th) + y*math.sin(th)) * f + ph)
    return v / sum(w[3] for w in ws)
WARP = [(random.uniform(0, math.tau), random.uniform(.004, .01), random.uniform(0, math.tau), 1) for _ in range(4)]
def field(x, y):
    wx = x + 140 * noise(x, y, WARP)
    wy = y + 140 * noise(y + 300, x - 200, WARP)
    ang = math.pi/2 + AMP * noise(wx, wy)
    return math.cos(ang), math.sin(ang)

def trace(x, y, steps=320, h=3.0):
    pts = [(x, y)]
    for direction in (1, -1):
        px, py = x, y
        seg = []
        for _ in range(steps):
            # RK2
            ax, ay = field(px, py)
            bx, by = field(px + ax*h*direction*.5, py + ay*h*direction*.5)
            px += bx*h*direction; py += by*h*direction
            if not (-40 < px < W+40 and -40 < py < H+40): break
            seg.append((px, py))
        pts = (list(reversed(seg)) + pts) if direction == -1 else pts + seg
    return pts

def path(pts):
    pts = pts[::3]
    if len(pts) < 4: return ''
    out = f'M{pts[0][0]:.0f} {pts[0][1]:.0f}'
    for i in range(1, len(pts)-1, 2):
        (x1, y1), (x2, y2) = pts[i], pts[i+1]
        out += f'Q{x1:.0f} {y1:.0f} {x2:.0f} {y2:.0f}'
    return out

# Ribbons: a seed and a normal; strands are seeded side by side across it so
# they run in bundles, the way marbled colour does.
layers = {'mid': [], 'bright': []}
RIBBONS = 16
for r in range(RIBBONS):
    sx, sy = random.gauss(W*.55, W*.22), random.gauss(H*.5, H*.25)
    fx, fy = field(sx, sy); nx, ny = -fy, fx
    n = random.randint(9, 20)
    gap = random.uniform(2.6, 4.2)
    for i in range(n):
        t = i - n/2
        x, y = sx + nx*t*gap, sy + ny*t*gap
        d = path(trace(x, y))
        if not d: continue
        edge = abs(t) / (n/2)
        layer = 'bright' if (edge < .35 and random.random() < .7) else 'mid'
        w = random.uniform(.5, 1.3) * (1.25 - edge*.5)
        a = random.uniform(.45, 1) * (1 - edge*.55)
        layers[layer].append((d, w, a))

def svg(items, glow):
    body = []
    if glow:
        body += [f'<path d="{d}" stroke-width="{w*6:.0f}" stroke-opacity=".06"/>' for d, w, a in items[::4]]
    body += [f'<path d="{d}" stroke-width="{w:.1f}" stroke-opacity="{a:.1f}"/>' for d, w, a in items]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
            f'<g fill="none" stroke="#000" stroke-linecap="round">' + ''.join(body) + '</g></svg>')

out = sys.argv[2] if len(sys.argv) > 2 else '.'
for k, items in layers.items():
    open(f'{out}/forge-flow-{k}.svg', 'w').write(svg(items, glow=(k == 'bright')))
    print(k, len(items))
