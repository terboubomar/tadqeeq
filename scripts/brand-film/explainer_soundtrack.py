"""Original soundtrack for the 154 s Tadqeeq explainer: a quieter bed under the voice-over + scene-synced effects.

Everything is synthesized here (no samples), so the audio is fully owned.
Writes explainer-soundtrack.wav (44.1 kHz stereo).
"""
import json
import os
import wave

import numpy as np

SR = 44_100
# Optional time warp so effects follow a voice-over: anchors map real time <-> film time.
_W = json.load(open(os.environ["WARP"])) if os.environ.get("WARP") else None
DUR = _W["duration"] if _W else 154.0
_REAL = np.array([a[0] for a in _W["real"]]) if _W else None
_FILM = np.array([a[1] for a in _W["real"]]) if _W else None


def W(film_t):
    """Film time -> real time."""
    if _W is None:
        return film_t
    if film_t >= _FILM[-1]:
        return _REAL[-1] + (film_t - _FILM[-1])
    return float(np.interp(film_t, _FILM, _REAL))

N = int(SR * DUR)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR


def note_hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def lowpass_fast(x, cutoff, passes=2):
    # Vectorised one-pole via scipy-free recursion in chunks is slow; use FFT brickwall-ish smoothing.
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 / (1 + (freqs / cutoff) ** (2 * passes))
    return np.fft.irfft(spec, n=len(x))


def adsr(n, a, d, s, r):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    env = np.concatenate([
        np.linspace(0, 1, a_n, endpoint=False),
        np.linspace(1, s, d_n, endpoint=False),
        np.full(s_n, s),
        np.linspace(s, 0, r_n),
    ])
    return np.pad(env, (0, max(0, n - len(env))))[:n]


left = np.zeros(N)
right = np.zeros(N)


def add(sig, start, pan=0.0, gain=1.0, real=False):
    i = int((start if real else W(start)) * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    # De-click: ramp the first 2 ms and last 10 ms of every event.
    a, z = min(len(sig), int(0.002 * SR)), min(len(sig), int(0.010 * SR))
    sig = sig.copy()
    if a:
        sig[:a] *= np.linspace(0, 1, a)
    if z:
        sig[-z:] *= np.linspace(1, 0, z)
    left[i : i + len(sig)] += sig * np.sqrt((1 - pan) / 2) * np.sqrt(2)
    right[i : i + len(sig)] += sig * np.sqrt((1 + pan) / 2) * np.sqrt(2)


# ---- Pad: warm detuned saws, chord per 4 beats. Key: D minor with a Hijaz colour (Eb) on the turn.
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
chords = [
    [50, 57, 62, 65],  # Dm
    [46, 53, 58, 62],  # Bb
    [48, 55, 60, 64],  # C
    [45, 52, 57, 61],  # A (Hijaz-flavoured dominant)
]


def saw_pad(freqs, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            phase = rng.random()
            out += 2 * ((t * ff + phase) % 1) - 1
    out /= len(freqs) * 3
    return out * adsr(n, 0.9, 0.5, 0.8, 1.2)


pad = np.zeros(N)
bar = 0
pos = 0.0
while pos < DUR:
    seg = saw_pad([note_hz(m) for m in chords[bar % 4]], BAR + 1.0)
    i = int(pos * SR)
    end = min(N, i + len(seg))
    pad[i:end] += seg[: end - i]
    pos += BAR
    bar += 1
pad = lowpass_fast(pad, 1100)
# Darker during the opening logo, open up after.
pad *= np.interp(t_all, [0, W(3.5), W(145.5), W(148), DUR], [0.55, 0.75, 0.75, 0.7, 0.0])
add(pad, 0, gain=0.34, real=True)
right_shift = np.roll(pad, int(0.012 * SR)) * 0.22
right[: len(right_shift)] += right_shift * 0.3


# ---- Bass pulse on beats, softer than the brand film so the voice sits on top.
def bass_hit(freq):
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 9) + 0.3 * np.sin(4 * np.pi * freq * t) * np.exp(-t * 14)


b = W(4.0)
k = 0
while b < W(145.4):
    root = chords[int(b / BAR) % 4][0] - 12
    add(bass_hit(note_hz(root)), b, gain=0.16 if k % 2 == 0 else 0.08, real=True)
    b += BEAT
    k += 1


# ---- Soft hi-hats through the Telegram chapter, where the story moves fastest.
def hat():
    n = int(0.06 * SR)
    noise = rng.standard_normal(n)
    noise = noise - lowpass_fast(noise, 6000)
    return noise * np.exp(-np.arange(n) / SR * 70)


b = W(52.0) + BEAT / 2
while b < W(96.0):
    add(hat(), b, pan=0.3, gain=0.04, real=True)
    b += BEAT


# ---- Effects
def whoosh(length=0.9, rising=True):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    steps = 24
    for s in range(steps):
        a, z = s * n // steps, (s + 1) * n // steps
        frac = s / steps if rising else 1 - s / steps
        cutoff = 300 + 5000 * frac
        seg = lowpass_fast(noise[a:z], cutoff)
        out[a:z] = seg
    env = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return out * env


def pop(freq=880, length=0.18):
    n = int(length * SR)
    t = np.arange(n) / SR
    sweep = freq * (1 + 0.6 * np.exp(-t * 40))
    return np.sin(2 * np.pi * np.cumsum(sweep) / SR) * np.exp(-t * 22)


def bell(freq, length=2.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    partials = [(1, 1.0), (2.0, 0.5), (2.76, 0.35), (5.4, 0.15), (8.9, 0.06)]
    out = sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t * (1.6 + m * 0.9)) for m, a in partials)
    return out / 2


def click():
    n = int(0.025 * SR)
    noise = rng.standard_normal(n)
    return (noise - lowpass_fast(noise, 2500)) * np.exp(-np.arange(n) / SR * 260)


def riser(length=1.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 200 * (6 ** (t / length))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (whoosh(length) * 0.7 + tone) * np.linspace(0, 1, n) ** 2



def typing(start, end):
    at = start
    while at < end:
        add(click(), at, pan=rng.uniform(-0.2, 0.2), gain=0.06)
        at += rng.uniform(0.045, 0.09)


# Opening: riser into a logo bell chord.
add(riser(1.2), 0.0, gain=0.25)
for m, p in ((74, -0.3), (77, 0.0), (81, 0.3)):
    add(bell(note_hz(m)), 1.15, pan=p, gain=0.16)

# Scene transitions.
for at in (3.8, 14.8, 24.8, 34.8, 43.8, 51.8, 63.8, 77.8, 95.8, 109.8, 121.8, 133.8):
    add(whoosh(0.8), at, pan=rng.uniform(-0.4, 0.4), gain=0.18)

# The problem: counters, then the question.
for at in (5.0, 6.2):
    add(pop(1046), at, gain=0.1)
for at, m in ((6.4, 81), (7.6, 84)):
    add(bell(note_hz(m), 1.2), at, gain=0.05)
add(bass_hit(note_hz(38)) * 1.4, 11.8, gain=0.3)

# Upload: files drop, analysis completes.
for at in (19.6, 19.95):
    add(pop(880), at + 0.8, gain=0.1)
add(bell(note_hz(84), 1.2), 23.8, gain=0.07)

# Recalculation: two matches, two differences.
for at in (27.0, 28.4):
    add(pop(1175, 0.14), at, gain=0.09)
for at in (29.8, 31.2):
    add(bass_hit(note_hz(45)) * 0.9, at, gain=0.2)

# Exception status moves to closed.
add(pop(740), 38.8, gain=0.09)
add(bell(note_hz(88), 1.2), 41.0, gain=0.08)

# The leak.
add(bass_hit(note_hz(38)) * 1.3, 44.3, gain=0.28)
add(pop(660), 46.6, gain=0.1)
add(bass_hit(note_hz(36)), 49.0, gain=0.22)

# Telegram setup: bot joins, /connect, confirmed.
for at in (55.0, 58.6):
    add(pop(988, 0.12), at, gain=0.1)
add(bell(note_hz(84), 1.0), 60.4, gain=0.08)

# Cashier: video sent, saved; receipt scanned, number read.
add(pop(988, 0.12), 65.8, gain=0.1)
add(bell(note_hz(81), 1.0), 68.4, gain=0.07)
add(pop(988, 0.12), 72.4, gain=0.1)
add(whoosh(1.6, rising=True), 73.4, gain=0.08)
add(bell(note_hz(86), 1.2), 75.6, gain=0.08)

# Compensation Center: search, evidence found, request typed.
typing(79.8, 81.0)
add(pop(880), 82.6, gain=0.1)
add(bell(note_hz(79), 1.0), 87.2, gain=0.06)
typing(87.8, 92.6)
add(bell(note_hz(84), 1.2), 92.6, gain=0.06)

# Result (illustrative).
for at in (97.4, 99.6, 102.0):
    add(pop(1046), at, gain=0.1)
for m, p in ((74, -0.3), (79, 0.0), (83, 0.3)):
    add(bell(note_hz(m), 2.0), 103.4, pan=p, gain=0.08)

# Ads.
for at in (111.0, 113.4):
    add(pop(660), at, gain=0.1)
add(bass_hit(note_hz(41)), 116.6, gain=0.2)

# Smart Watch alert and smart columns.
add(pop(740), 124.0, gain=0.1)
for at in (124.5, 124.75):
    add(bell(note_hz(76), 0.6), at, gain=0.08)
add(whoosh(0.4), 129.4, gain=0.1)
for m in (79, 84):
    add(bell(note_hz(m), 1.4), 130.4, gain=0.08)

# AI and trust.
add(pop(988, 0.12), 135.6, gain=0.1)
typing(137.2, 139.6)
for at, m in ((140.6, 84), (142.0, 88)):
    add(bell(note_hz(m), 1.2), at, gain=0.06)

# Close: logo hit and resolving chord.
add(riser(1.0), 145.2, gain=0.2)
add(bass_hit(note_hz(38)) * 1.5, 146.3, gain=0.4)
for m, p in ((62, -0.4), (69, -0.1), (74, 0.15), (77, 0.4)):
    add(bell(note_hz(m), 4.0), 146.35, pan=p, gain=0.12)


# ---- Space: simple stereo reverb (feedback delays).
def reverb(x, delays=(0.031, 0.047, 0.061, 0.083), fb=0.55, mix=0.22):
    out = x.copy()
    for d in delays:
        n = int(d * SR)
        buf = np.zeros_like(x)
        buf[n:] = x[:-n]
        acc = buf.copy()
        for _ in range(5):
            shifted = np.zeros_like(acc)
            shifted[n:] = acc[:-n] * fb
            acc = buf + shifted
        out += lowpass_fast(acc, 4000) * mix / len(delays)
    return out


left = reverb(left)
right = reverb(right, delays=(0.029, 0.043, 0.067, 0.089))

# ---- Master: fades, normalise, soft limit.
fade = np.interp(t_all, [0, 0.05, DUR - 1.8, DUR], [0, 1, 1, 0])
mix = np.stack([left, right], axis=1) * fade[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.4) / np.tanh(1.4) * 0.89

with wave.open("explainer-soundtrack.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("ok", mix.shape)
