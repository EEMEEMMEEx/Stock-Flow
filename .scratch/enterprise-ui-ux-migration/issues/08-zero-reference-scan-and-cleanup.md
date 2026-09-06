# 08: Contract Phase — Zero-reference scan & legacy CSS shim removal

**What to build:** Audit the entire repository for any remaining references to legacy classes (`neu-*`, `glass`, `--neu-*`, `--glass-*`), replace any stragglers with standard primitives or utility classes, and safely delete the transitional compatibility shims from `src/App.css`.

**Blocked by:** 05: Operational Workflows — Dashboard & Items Inventory catalog, 06: Operational Workflows — Stock In, Withdrawals & Checkouts POS Terminals, 07: Administration & Account — Settings, RBAC Roles, Users, Profile & Manual

**Status:** closed

- [x] Automated grep search confirms 0 occurrences of `neu-*` in application code
- [x] Automated grep search confirms 0 occurrences of `glass` in application code
- [x] Transitional compatibility shims removed from `src/App.css`
- [x] Application compiles cleanly without missing class warnings or broken layouts
