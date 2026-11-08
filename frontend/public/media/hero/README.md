# Hero video clips

The landing-page hero plays these files in order, crossfading between them:

| File | Suggested shot |
| --- | --- |
| `sedan.webm` / `sedan.mp4` | Sedan on a coastal or open highway |
| `suv.webm` / `suv.mp4` | SUV through hills or a mountain road |
| `truck.webm` / `truck.mp4` | Truck on an open road |
| `hybrid.webm` / `hybrid.mp4` | Hybrid or electric vehicle in a modern city |
| `poster.jpg` | Optional still shown while the first clip loads |

Any clip that is missing is skipped. With no clips, the hero shows its built-in animated scene, so the site works without these files.

## Licensing

Only add footage you have the right to use: your own recordings, Toyota-provided media with written permission, or stock footage whose license allows commercial use and depicts the vehicles accurately. Do not use Toyota promotional videos downloaded from the web. Keep a note of each clip's source and license next to the file (for example `sedan.LICENSE.txt`).

## Encoding

Keep each clip short (6–12 s), muted, and under ~4 MB:

```bash
ffmpeg -i in.mov -an -vf "scale=1920:-2,fps=30" -c:v libvpx-vp9 -b:v 2M -row-mt 1 sedan.webm
ffmpeg -i in.mov -an -vf "scale=1920:-2,fps=30" -c:v libx264 -crf 24 -preset slow -movflags +faststart sedan.mp4
```

Clip names and labels live in `src/media/heroClips.ts`.
