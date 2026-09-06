# 03: Core UI Primitives modernization

**What to build:** Overhaul shared primitives in `src/components/ui/` (Button, Card, Input, Table, Dialog, RoleBadge, Tooltip) into accessible, high-contrast components without physical bevels, inset shadows, blur overlays, or `active:scale` animations, establishing the single authoritative source of truth for the entire design system.

**Blocked by:** 02: Expand Phase — Design tokens & transitional compatibility shims in App.css

**Status:** ready-for-agent

- [ ] Button variants streamlined with crisp focus-visible rings and no bouncy scale transforms
- [ ] Card surfaces standardized with solid opaque backgrounds and 1px subtle borders
- [ ] Input fields standardized with consistent height, clean borders, and clear focus rings
- [ ] Table headers and rows updated with muted header background and subtle row dividers
- [ ] Dialogs and Modals updated to solid opaque surfaces with proper dark overlays
- [ ] Role badges and status presets mapped to accessible semantic color pairs
