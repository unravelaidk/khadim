If the user asks to create a **game**, **interactive app**, **canvas game**, **Flappy Bird**, **Snake**, **Tetris**, or similar game/interactive project, follow these steps:

**IMPORTANT**: Use Vite with React (NOT React Router) for games. It's simpler and faster.

1. **Create the Plan**:
   - Call `create_plan` first with the game name, steps, and estimated tool calls.

2. **Scaffold with Vite**:
   - Use `create_web_app` with `type: "vite"` (NOT "react-router").
   - Example: `create_web_app({ type: "vite", name: "flappy-bird" })`

3. **Install Dependencies**:
   - Run: `cd <game-name> && npm install`

4. **Create the Game**:
   - Write game files directly using `write_file`:
     - `<game-name>/src/App.tsx` - Main game component with Canvas/game logic
     - `<game-name>/src/App.css` - Game styles
   - Use HTML5 Canvas for 2D games
   - Use requestAnimationFrame for smooth animations
   - Handle keyboard/mouse input with event listeners

5. **Build the App**:
   - Run: `cd <game-name> && npm run build`

6. **🚨 IMMEDIATELY Serve the Preview** (right after build succeeds!):
   - Your VERY NEXT tool call after "npm run build" succeeds MUST be expose_preview
   - **DO NOT** read files, list directories, or do anything else first!
   - Vite outputs to `<game-name>/dist`
   - Call the expose_preview TOOL (not a shell command):
     ```
     Tool: expose_preview
     Arguments: { "port": 8000, "startServer": true, "root": "<game-name>/dist" }
     ```

## ⚠️ CRITICAL - DO NOT USE SHELL TO START SERVERS ⚠️

**NEVER** use the `shell` tool to run servers. The shell tool BLOCKS until the command finishes, causing the agent to hang forever!

❌ **FORBIDDEN** (will hang forever):
- `shell({ command: "python3 -m http.server 8000" })`
- `shell({ command: "npm run dev" })`
- `shell({ command: "npm run preview" })`
- `shell({ command: "npx serve dist" })`

✅ **CORRECT** - Call the 'expose_preview' TOOL (not a shell command!):
```
Tool: expose_preview  
Arguments: { "port": 8000, "startServer": true, "root": "<game-name>/dist" }
```

The `expose_preview` tool handles backgrounding the server correctly.

## Game Development Tips:
- Use `useRef` for Canvas element reference
- Use `useEffect` for game loop setup
- Use `useState` for game state (score, gameOver, etc.)
- Clean up requestAnimationFrame in useEffect cleanup
- Add keyboard listeners in useEffect

## Example Game Structure:
```tsx
import { useRef, useEffect, useState } from 'react';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    let animationId: number;

    const gameLoop = () => {
      // Update game state
      // Draw to canvas
      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return <canvas ref={canvasRef} width={400} height={600} />;
}
```
