# Brand film

30 fps film drawn by `src/components/film/BrandFilm.tsx` (route `/film?t=<seconds>&format=wide|tall`).

1. `npx vite dev --port 5175`
2. Video: `WARP=warp.json FFMPEG=<ffmpeg with libx264> node render.mjs wide out-wide.mp4` (and `tall`).
   `warp.json` maps voice-over time to film time so each scene starts with its line.
3. Music and effects: `WARP=warp.json python soundtrack.py` → `soundtrack.wav` (all synthesized, fully owned).
4. Mix: voice-over (ElevenLabs, delayed 0.3 s) over the music, music ducked under the voice
   (ffmpeg `sidechaincompress`), loudness -14 LUFS; see the session notes for the exact filter.

`voiceover-ar.srt` is the timed Arabic script.
