# Hero video: Toyota Tundra TRD Pro

The landing-page hero plays one clip on a seamless loop (the end of each pass crossfades into the start of the next, so there is never a black frame).

| File | Purpose |
| --- | --- |
| `tundra-trd-pro.webm` | Main clip, VP9. Used by browsers that support WebM. |
| `tundra-trd-pro.mp4` | Same clip, H.264. Used everywhere else. |
| `tundra-trd-pro-poster.jpg` | Still frame shown while the video loads, on Save-Data connections, and with reduced motion. |

If the video files are missing, the hero shows the poster as a static background. If the poster is missing too, it shows the built-in dusk scene. The site works without any of these files.

## Shot brief

A dark metallic gray Toyota Tundra TRD Pro drives **right to left** along a rugged dirt road through rolling mountain hills at golden hour.

- Stationary roadside camera at roughly eye level; three-quarter to side view; stable framing.
- The truck enters from the right and travels left. Keep the **left 45% of the frame calm** — the headline sits there.
- Warm low sun, natural haze, rocks, grass, and dust trailing the rear tires.
- Believable acceleration, wheel rotation, and suspension movement. No cuts, no frame jumps, no vehicle deformation.

## Licensing

Only add footage you have the right to use: your own recording, Toyota-provided media with written permission, or stock footage whose license allows commercial use and shows the real vehicle accurately. Do not use Toyota promotional videos downloaded from the web, and do not use unrelated stock footage. Keep a note of the source and license next to the file (for example `tundra-trd-pro.LICENSE.txt`).

## Encoding

16:9 source at 1920×1080, 8–14 s, muted, ideally under ~5 MB per file:

```bash
ffmpeg -i in.mov -an -vf "scale=1920:-2,fps=30" -c:v libvpx-vp9 -b:v 2.2M -row-mt 1 tundra-trd-pro.webm
ffmpeg -i in.mov -an -vf "scale=1920:-2,fps=30" -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart tundra-trd-pro.mp4
ffmpeg -ss 2 -i in.mov -frames:v 1 -vf "scale=1920:-2" -q:v 3 tundra-trd-pro-poster.jpg
```

Clip names and the label live in `src/media/heroClips.ts`.
