# 02: Expand Phase — Design tokens & transitional compatibility shims in App.css

**What to build:** Replace the muddy light-mode background and hidden borders with crisp slate enterprise tokens, standard 8px/12px radius, and subtle functional shadows. Introduce transitional compatibility shims for legacy Neumorphism and Glassmorphism utility classes so the entire portal immediately transforms into a high-contrast, clean modern aesthetic without breaking any existing component.

**Blocked by:** 01: Pre-flight baseline, test verification & feature branch setup

**Status:** closed

- [x] Light-mode background updated to crisp slate (`#f8fafc`) and cards to pure white (`#ffffff`)
- [x] 1px crisp borders restored across all surfaces (`#e2e8f0` Light / `#242e3d` Dark)
- [x] Border radius scale standardized to 8px for controls and 12px for cards/dialogs
- [x] Compatibility shims active for `.neu-flat`, `.neu-button`, `.neu-pressed`, and `.glass`
- [x] Application compiles cleanly (`npm run build` passed in 25.05s) and all existing pages render in modern flat enterprise style
