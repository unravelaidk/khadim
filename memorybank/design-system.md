# Khadim Design System

> Minimalist modern design with Radix UI primitives and Tailwind CSS.

## Dependencies

```bash
bun add @radix-ui/react-dialog @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-slot
```

## Color Palette

Defined in `app/app.css` using `@theme` with `gb-*` prefix:

| Token           | Value     | Usage                  |
| --------------- | --------- | ---------------------- |
| `gb-primary`    | `#5C5C5C` | Buttons, user messages |
| `gb-bg`         | `#FAFAF8` | Page background        |
| `gb-bg-subtle`  | `#F5F5F0` | Secondary surfaces     |
| `gb-bg-card`    | `#FFFFFF` | Cards, modals          |
| `gb-text`       | `#1A1A1A` | Primary text           |
| `gb-text-muted` | `#999999` | Muted text             |
| `gb-border`     | `#E8E8E5` | Borders                |

## UI Primitives

Located in `app/components/ui/`:

### Button

```tsx
import { Button } from "~/components/ui";

<Button variant="primary">Deploy</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost" size="sm">Edit</Button>
```

### Dialog (Modal)

```tsx
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui";

<Dialog open={isOpen} onOpenChange={setOpen}>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Title</DialogTitle>
        </DialogHeader>
        <div className="p-6">Content</div>
        <DialogFooter>
            <Button>Confirm</Button>
        </DialogFooter>
    </DialogContent>
</Dialog>;
```

### ScrollArea

```tsx
import { ScrollArea } from "~/components/ui";

<ScrollArea className="h-[300px]">
    {/* Long content */}
</ScrollArea>;
```

## Component Structure

```
app/components/
├── ui/                       # Radix UI primitives
│   ├── index.ts
│   ├── button.tsx
│   ├── dialog.tsx
│   └── scroll-area.tsx
├── AgentBuilder.tsx
└── agent-builder/
    ├── index.ts
    ├── types.ts
    ├── Header.tsx
    ├── GameBoyScreen.tsx
    ├── ChatMessage.tsx
    ├── ChatInput.tsx
    ├── TypingIndicator.tsx
    ├── SuggestionCards.tsx
    └── PreviewModal.tsx
```
