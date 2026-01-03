# AgentBuilder Component Architecture

> Memory bank documentation for AI agents working on the Dexo project.

## Overview

The **AgentBuilder** is the main chat interface for creating AI agents. It uses
a **Game Boy-inspired design** with a modular component structure.

## File Structure

```
app/components/
├── AgentBuilder.tsx              # Main orchestrator
└── agent-builder/
    ├── index.ts                  # Barrel exports
    ├── theme.ts                  # Game Boy color palette
    ├── types.ts                  # Shared TypeScript interfaces
    │
    ├── Header.tsx                # Navigation + branding
    ├── GameBoyScreen.tsx         # Chat container with bezel
    ├── ChatMessage.tsx           # Message bubble
    ├── ChatInput.tsx             # Text input + send button
    ├── TypingIndicator.tsx       # Animated dots
    ├── SuggestionCards.tsx       # Quick start prompts
    └── PreviewModal.tsx          # Agent preview/deploy modal
```

## Theme System

### Color Palette (`theme.ts`)

```typescript
export const gbColors = {
  darkest: "#0f380f", // Background, shadows, borders
  dark: "#306230", // Header, user message bg
  light: "#8bac0f", // Assistant message bg, secondary
  lightest: "#9bbc0f", // Screen bg, primary actions
  cream: "#c4cfa1", // Body/bezel color
  screen: "#9bbc0f", // Screen background
};
```

### Usage

All components import `gbColors` from `theme.ts` and apply via inline styles.

---

## Component Details

### 1. Header

| Prop          | Type                  | Description                       |
| ------------- | --------------------- | --------------------------------- |
| `agentConfig` | `AgentConfig \| null` | Shows preview button when defined |
| `onPreview`   | `() => void`          | Opens preview modal               |

### 2. GameBoyScreen

| Prop       | Type        | Description               |
| ---------- | ----------- | ------------------------- |
| `children` | `ReactNode` | Content inside the screen |

Renders the cream bezel and screen container with inset shadow.

### 3. ChatMessage

| Prop      | Type      | Description              |
| --------- | --------- | ------------------------ |
| `message` | `Message` | Content, role, timestamp |

Parses `**bold**` markdown and applies role-based styling.

### 4. ChatInput

| Prop        | Type                  | Description                      |
| ----------- | --------------------- | -------------------------------- |
| `value`     | `string`              | Current input text               |
| `onChange`  | `(v: string) => void` | Input change handler             |
| `onSend`    | `() => void`          | Send action                      |
| `isCompact` | `boolean`             | Narrower width for initial state |

### 5. TypingIndicator

No props. Displays 3 bouncing dots with staggered animation.

### 6. SuggestionCards

| Prop       | Type                       | Description         |
| ---------- | -------------------------- | ------------------- |
| `prompts`  | `string[]`                 | List of suggestions |
| `onSelect` | `(prompt: string) => void` | Click handler       |

### 7. PreviewModal

| Prop          | Type          | Description      |
| ------------- | ------------- | ---------------- |
| `agentConfig` | `AgentConfig` | Agent to preview |
| `isOpen`      | `boolean`     | Visibility       |
| `onClose`     | `() => void`  | Close handler    |
| `onDeploy`    | `() => void`  | Deploy action    |

---

## Shared Types (`types.ts`)

```typescript
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface AgentConfig {
  name: string;
  description: string;
  capabilities: string[];
  personality: string;
}
```

---

## State Management

All state lives in the main `AgentBuilder.tsx`:

| State         | Type                  | Purpose             |
| ------------- | --------------------- | ------------------- |
| `messages`    | `Message[]`           | Chat history        |
| `input`       | `string`              | Current input       |
| `isTyping`    | `boolean`             | AI typing indicator |
| `agentConfig` | `AgentConfig \| null` | Built agent config  |
| `showPreview` | `boolean`             | Modal visibility    |

---

## Design Principles

1. **Single Responsibility**: Each component does one thing
2. **Props Down**: All data flows via props from AgentBuilder
3. **Theme Consistency**: All styling uses `gbColors`
4. **Composability**: Components can be reused elsewhere
5. **Monospace Typography**: All text uses `font-mono` for retro feel

---

## Adding New Features

### To add a new component:

1. Create file in `app/components/agent-builder/`
2. Import `gbColors` from `./theme`
3. Add to `index.ts` barrel exports
4. Import and compose in `AgentBuilder.tsx`

### To modify colors:

Edit `theme.ts` - changes propagate everywhere.
