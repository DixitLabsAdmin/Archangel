# Eurelyas

*Guardian of Titanica — a desktop companion.*

A floating, always-on-top Windows assistant in the form of a winged guardian. Built for Ajit Dixit, powered by Claude Opus 4.7.

## What this is

Not a chat window. A **character** that lives on your desktop. Eurelyas hovers in the lower-right corner in a small meditative idle state, breathing and swaying. Press **Ctrl+Shift+Space** (or click the figure) to summon. He scales up to full presence, glows brighter, and a chat panel slides in beside him. Dismiss and he returns to rest.

The character is rendered from a 2D image (`src/character/assets/eurelyas.png`) with CSS-driven state animations (idle, aware, summoned, thinking, speaking, sleeping), a golden particle overlay, and dynamic glow effects.

## Quick start

```powershell
# 1. Install Node.js 20+
# 2. Install dependencies
cd eurelyas
npm install

# 3. Add your Anthropic API key
copy .env.example .env
# then edit .env and paste your key

# 4. Run in dev mode
npm run dev
```

Press **Ctrl+Shift+Space** anywhere in Windows to summon or dismiss Eurelyas.

## Architecture

Two Electron windows, one shared Claude/shell/notes backend:

- **Character window** — transparent, click-through outside the character silhouette, holds the Three.js scene. State machine: `idle · aware · summoned · thinking · speaking · sleeping`.
- **Chat panel** — opens when summoned. Three tabs: Counsel (chat), Ledger (notes, autosaves to disk), Command (shell).
- **Main process** — bridges the two windows, calls the Anthropic API, executes shell commands (with a destructive-command blocklist), persists notes.

## Design

The palette is synthesized from three MTG angel cards you provided — Melissa Benson's *Angel of Mercy* (cool whites, icy-blue shadow), Volkan Baga's *Angel of Mercy* (antique burnished gold), Keith Parkinson's *Angel of Fury* (golden light-arc effects). Full palette lives in `src/shared/palette.js`.

**Form:** Four wings (two large primary, two small secondary), helmeted head (Angemon-style — only mouth and chin visible), golden staff (perfect circular pole with a crown orb that glows when he thinks/speaks), robe with icy-blue shadow tones, floating full-body.

**Personality:** Sparse, grounded, protective. Not Gandalf-verbose, not Jedi Council formal. Closer to Heero Yuy's discipline + All Might's reliability + Gandalf at Khazad-dûm's gravity. System prompt in `electron/main.js` (`EURELYAS_SYSTEM_PROMPT`) — refine as you live with him.

## Quick start

```powershell
# 1. Install Node.js 20+
# 2. Install dependencies
cd eurelyas
npm install

# 3. Add your Anthropic API key
cp .env.example .env
# then edit .env and paste your key

# 4. Run in dev mode
npm run dev
```

Press **Ctrl+Shift+Space** anywhere in Windows to summon or dismiss Eurelyas.

## Package as an installable .exe

```powershell
npm run dist
```

Produces a Windows installer in `dist/`. Add to `shell:startup` so he launches at login.

## Swapping in a Nano Banana / sculpted image (the look you actually want)

The procedural Three.js version is scaffolding. To use a real Eurelyas image:

1. Generate the character image (Nano Banana / Midjourney / commissioned art). Save as transparent PNG.
2. Drop it at `src/character/assets/eurelyas.png` (see that folder's README for prompt tips and specs).
3. In `src/main.jsx`, swap one import:
   ```js
   // from:
   import CharacterWindow from './character/CharacterWindow.jsx';
   // to:
   import CharacterWindow from './character/SpriteCharacterWindow.jsx';
   ```
4. Restart `npm run dev`.

The sprite version keeps every system working — state machine, animations, Claude integration, particle overlay, glow effects, chat sync. Only the character presentation changes.

## Swapping in a proper 3D model (later)

When you commission a sculpted Eurelyas (Blender/ArtStation/Meshy), drop the GLB into `src/character/assets/` and modify `EurelyasScene._buildCharacter()`:

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
loader.load('/assets/eurelyas.glb', (gltf) => {
  this.root.add(gltf.scene);
  // map animation clips to states: gltf.animations → this.mixer
});
```

Everything else — state machine, wing/staff animation triggers, Claude sync, particle system, IPC — keeps working.

## Roadmap / ideas

- **Tool use** — let Claude call `shell:exec`, file ops, calendar from within the chat; he decides when to act, not just respond.
- **MCP connectors** — you're already on Gmail, Drive, Slack, Miro, Calendar — wire them in and Eurelyas can act across your whole stack.
- **Proactive presence** — he notices long idle periods, upcoming calendar events, a file you've had open for hours. Peeks. Gets your attention only when it matters.
- **Selection hotkey** — select text anywhere in Windows, hit a hotkey, he offers a rewrite/summary/translation.
- **Voice** — ElevenLabs for a spoken register matching his written one. Use sparingly.
- **Memory beyond a session** — persistent long-term notebook of Ajit's projects (Titanica, Dixit Labs, bee sanctuary plan, investment thesis) so he tracks continuity across weeks.

## Safety

Shell commands pass through a basic blocklist (`rm -rf /`, `format c:`, `shutdown`, etc.) in `main.js`. Harden this before giving Eurelyas any autonomy. For agentic behavior, **whitelist** commands rather than blocklist them.

## File layout

```
eurelyas/
├── electron/
│   ├── main.js              # two-window architecture, IPC, Claude integration
│   └── preload.js           # contextBridge API exposed to renderer
├── src/
│   ├── character/
│   │   ├── CharacterWindow.jsx        # Three.js version (default, procedural)
│   │   ├── EurelyasScene.js           # the whole Three.js build
│   │   ├── SpriteCharacterWindow.jsx  # image version (use after Nano Banana)
│   │   ├── SpriteCharacter.jsx        # sprite renderer with state animations
│   │   └── assets/
│   │       └── eurelyas.png           # YOUR image goes here
│   ├── chat/
│   │   └── ChatWindow.jsx        # chat / notes / shell panel
│   ├── shared/
│   │   └── palette.js            # MTG-synthesized color constants
│   ├── main.jsx                  # routes to character or chat window
│   └── index.css                 # Cinzel/Cormorant fonts + scrollbars
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── .env.example
```
