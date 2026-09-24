# brag — done ✅

The video was built **and rendered**.

- `brag.mp4` — 1920x1080, 20.0s, H.264 + AAC (~2 MB)
- `brag.jpg` — poster frame (the panel / Ban-ID moment)
- `brag-plan.md` — storyboard · `composition-brief.md` — handoff brief · `share-copy.txt` — captions
- `composition/` — the Hyperframes source (`index.html` + `assets/`)

## Re-render or tweak
Edit `composition/index.html`, then from the project root:
```
set PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin;%PATH%
npx hyperframes check  brag-output/composition
npx hyperframes render brag-output/composition -o brag-output/brag.mp4 -q high -f 30
```
(`-q high` for a higher-bitrate master; `-q draft` for a fast preview.)

## Live preview studio (scrub the timeline in a browser)
```
npx hyperframes preview
# then open the printed http://localhost:3002/... URL
```

## Notes
- Lint is clean of errors. The remaining warnings are advisory only — Hyperframes
  suggests splitting each scene (`#s1`–`#s4`) into its own file under `compositions/`
  and mounting via `data-composition-src`. The single-file composition renders fine.
- Tone is **polished**. To try another cut: change the storyboard in `brag-plan.md`
  and re-run `/brag`, or ask for `--tone cinematic`, `--format vertical` (9:16), etc.
