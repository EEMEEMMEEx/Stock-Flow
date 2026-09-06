# 09: Final Verification, WCAG 2.2 AA Contrast Audit & SemVer Release

**What to build:** Conduct full multi-device visual validation (320px, 375px, 768px, 1024px, 1440px), perform automated and manual WCAG 2.2 AA contrast audits, verify full keyboard navigation across all core modals, execute operational smoke tests for inventory transactions, and bump the application version in accordance with SemVer policy.

**Blocked by:** 08: Contract Phase — Zero-reference scan & legacy CSS shim removal

**Status:** ready-for-agent

- [ ] All text and UI component contrast ratios meet WCAG 2.2 AA in both Light and Dark mode
- [ ] Responsive layout verified at 320px, 375px, 768px, 1024px, and 1440px viewports
- [ ] Keyboard navigation (Tab, Shift+Tab, Enter, Space, Escape) functions across all modals and menus
- [ ] Operational smoke tests pass: goods receipt, withdrawal requisition, checkout loan and return
- [ ] `npm run build` and `npm run lint` execute with 0 errors
- [ ] Application version incremented per Mandatory System Version Management rules
