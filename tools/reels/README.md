# Tukbandi reels

Turns the poems on tukbandi.com into ready-to-post Instagram reels (1080×1920 video, text on a paper or night background) plus captions. This folder is not part of the website build.

## What's here

| File | What it is |
|---|---|
| `content-bank.json` | Every piece that can become a reel: the lines, a hook (the small heading at the top), a mood (picks the caption prompt and hashtags), a priority (`A` = most shareable) and, once used, the date it was scheduled for. |
| `reels.js` | Picks what to post next, renders the videos and writes the captions. |
| `fonts/` | Cormorant Garamond and Source Sans Pro (both SIL Open Font License). |
| `out/` | Rendered videos and caption files. Not committed. |

## Weekly routine

1. Render the next week:
   ```bash
   node reels.js next --count 7 --start 2026-11-30
   ```
   This writes 7 videos and `out/captions-2026-11-30.md`, and marks those pieces as scheduled in `content-bank.json` (commit that file so nothing repeats).
2. In Instagram, for each day: upload the video as a Reel, add a song from Instagram's music library (adding it in the app is what links the reel to that audio), paste the caption, and schedule it.

Use `--dry` to see what would be picked without rendering or changing anything.

## Adding a new poem

1. Add the poem to `"poems"` with its language (`urdu`, `english`, `punjabi`) and form (`ghazal`, `nazm`, `khat`, `khaaka`, `poem`).
2. Add one or more pieces to `"pieces"`:
   ```json
   { "poem": "New Poem", "tier": "A", "mood": "longing", "theme": "night", "hook": "a short line in your voice",
     "lines": ["first line", "second line"] }
   ```
   - `mood`: `longing`, `heartbreak`, `love`, `city`, `life`, `wit` or `hope`.
   - `theme`: `night` for a dark reel; leave it out for paper.
   - 2–4 lines work best.
3. Run `node reels.js ids` to give new pieces an id. New pieces are picked up by the next `next` run.

## Picking order

`next` prefers `A` pieces, spreads posts across all poems (no poem twice within about 10 days), avoids three reels in a row with the same look, and spaces out English and Punjabi pieces.

## Requirements

Node.js, ffmpeg, and Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`).
