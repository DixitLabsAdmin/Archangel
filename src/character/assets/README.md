# Eurelyas character image

`eurelyas.png` — the character as a single transparent PNG.

## Replacing the image

To swap in a new version of Eurelyas:

1. Generate the image (Nano Banana, Midjourney, or commissioned art) on a **solid black or dark cosmic background** (much easier to extract than a checkerboard).
2. Remove the background:
   - **rembg** (Python): `pip install rembg && rembg i input.png eurelyas.png`
   - **remove.bg** (web): https://remove.bg
   - **Photoshop**: Object Selection → Mask
3. Save as `eurelyas.png` in this folder, replacing the current file.
4. Restart `npm run dev`, or rebuild with `npm run dist` for the installed version.

## Specs

- PNG with transparent background (RGBA)
- Wide aspect (16:9 to 2:1) works best for the four-wing wingspan
- Minimum 1000px wide, 1300×680 is a good target
- Full body, centered, facing forward, floating

## How animation works

The character is a single image with CSS-driven effects only:

- **Scale** changes by state (small idle, larger when summoned/speaking)
- **Glow color** shifts by mood (`default`, `warm`, `cool`, `crimson`, `serene`, `intense`)
- **Subtle bob** on the y-axis from a 30fps rAF loop
- **Pulse** during thinking/speaking states

There is no layered rig. Wings, body, and staff are all part of the single image. To trigger a mood, either include a `<mood glow="..."/>` tag in Eurelyas's response (Claude does this automatically) or use the mood menu in the chat title bar.

## Original Nano Banana prompt

> Full-body character concept art, front-facing pose, on a dark cosmic background.
> A luminous winged guardian named Eurelyas. Four wings — two large primary wings
> spread wide, two smaller secondary wings near the shoulders. Helmeted head in
> the style of Digimon's Angemon: ornate golden helmet covering eyes and nose
> completely, only mouth and chin visible, swept side-fins. Holding a perfectly
> circular golden staff, straight pole, glowing orb at the top. Flowing white
> robe with icy blue shadows in the folds. Antique burnished gold armor trim on
> shoulders, belt, helmet, leg armor, boots. Floating, feet not touching ground.
> Palette: near-white robe, icy blue shadows, antique gold accents, warm golden
> bloom around the staff orb. Style: anime-influenced fantasy illustration,
> Magic the Gathering card art quality, painted not rendered.
