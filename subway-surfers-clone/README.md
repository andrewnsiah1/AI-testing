# City Runner - Subway Surfers Clone

A 3D endless runner game built with Three.js, inspired by Subway Surfers.

## Getting Started

```bash
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

## Controls

- **← → or A/D**: Switch lanes
- **↑ or W or Space**: Jump
- **↓ or S**: Slide
- **Swipe** (mobile): Swipe left/right/up/down

## Project Structure

```
src/
  main.js       - Game loop, scene setup, input handling
  player.js     - Player movement, jumping, sliding
  world.js      - Ground tiles, buildings, environment
  obstacles.js  - Obstacle spawning and management
  coins.js      - Coin spawning and collection
public/
  models/       - Drop .glb models here (from Mixamo, Kenney, etc.)
  textures/     - Texture images
```

## Adding Custom Models

1. Download character models from [Mixamo](https://mixamo.com)
2. Download environment assets from [Kenney](https://kenney.nl/assets)
3. Place `.glb` files in `public/models/`
4. Load them in the respective module using Three.js GLTFLoader

## Building for Production

```bash
npm run build
```

Output goes to `dist/`.
