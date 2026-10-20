import fs from 'fs';

// 3. Patch src/pages/Manual.jsx
let manualCode = fs.readFileSync('src/pages/Manual.jsx', 'utf8');

manualCode = manualCode.replace(
  'border border-border border-l-4 border-l-blue-500 bg-card shadow-xs space-y-2',
  'border border-border/80 bg-card shadow-xs space-y-2'
);
manualCode = manualCode.replace(
  'border border-border border-l-4 border-l-emerald-500 bg-card shadow-xs space-y-2',
  'border border-border/80 bg-card shadow-xs space-y-2'
);
manualCode = manualCode.replace(
  'border border-border border-l-4 border-l-purple-500 bg-card shadow-xs space-y-2',
  'border border-border/80 bg-card shadow-xs space-y-2'
);
manualCode = manualCode.replace(
  'border border-border shadow-xs border-l-4 ${sec.badgeColor} overflow-hidden transition-all duration-200 hover:shadow-md',
  'border border-border shadow-xs overflow-hidden transition-all duration-200 hover:shadow-md'
);

manualCode = manualCode.replaceAll('text-[10px]', 'text-xs');
manualCode = manualCode.replace('<User className="w-4 h-4 text-blue-500" />', '<User className="w-4 h-4 text-blue-500" aria-hidden="true" />');
manualCode = manualCode.replace('<ShieldCheck className="w-4 h-4 text-emerald-500" />', '<ShieldCheck className="w-4 h-4 text-emerald-500" aria-hidden="true" />');
manualCode = manualCode.replace('<Shield className="w-4 h-4 text-purple-500" />', '<Shield className="w-4 h-4 text-purple-500" aria-hidden="true" />');

fs.writeFileSync('src/pages/Manual.jsx', manualCode, 'utf8');
console.log('[PASS] Manual.jsx updated');

// 4. Patch prefers-reduced-motion in Landing components
let heroCode = fs.readFileSync('src/landing/components/HeroSection.jsx', 'utf8');
if (!heroCode.includes('motion-reduce:animate-none')) {
  heroCode = heroCode.replace(
    'className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"',
    'className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"'
  );
  fs.writeFileSync('src/landing/components/HeroSection.jsx', heroCode, 'utf8');
  console.log('[PASS] HeroSection.jsx: motion-reduce added');
}

let footerCode = fs.readFileSync('src/landing/components/LandingFooter.jsx', 'utf8');
if (!footerCode.includes('motion-reduce:animate-none')) {
  footerCode = footerCode.replace(
    'className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"',
    'className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"'
  );
  fs.writeFileSync('src/landing/components/LandingFooter.jsx', footerCode, 'utf8');
  console.log('[PASS] LandingFooter.jsx: motion-reduce added');
}

// 5. Patch prefers-reduced-motion in UI StatusBadge & UserStatusDot
let statusBadgeCode = fs.readFileSync('src/components/ui/StatusBadge.jsx', 'utf8');
if (statusBadgeCode.includes("config.pulse ? 'animate-pulse' : ''")) {
  statusBadgeCode = statusBadgeCode.replace(
    "config.pulse ? 'animate-pulse' : ''",
    "config.pulse ? 'motion-safe:animate-pulse' : ''"
  );
  fs.writeFileSync('src/components/ui/StatusBadge.jsx', statusBadgeCode, 'utf8');
  console.log('[PASS] StatusBadge.jsx: motion-safe added');
}

let userStatusDotCode = fs.readFileSync('src/components/ui/UserStatusDot.jsx', 'utf8');
if (userStatusDotCode.includes("hasPulse ? 'animate-pulse' : ''")) {
  userStatusDotCode = userStatusDotCode.replace(
    "hasPulse ? 'animate-pulse' : ''",
    "hasPulse ? 'motion-safe:animate-pulse' : ''"
  );
  fs.writeFileSync('src/components/ui/UserStatusDot.jsx', userStatusDotCode, 'utf8');
  console.log('[PASS] UserStatusDot.jsx: motion-safe added');
}

let skeletonCode = fs.readFileSync('src/components/ui/skeleton.jsx', 'utf8');
if (skeletonCode.includes('animate-pulse') && !skeletonCode.includes('motion-safe')) {
  skeletonCode = skeletonCode.replace(
    'animate-pulse',
    'motion-safe:animate-pulse'
  );
  fs.writeFileSync('src/components/ui/skeleton.jsx', skeletonCode, 'utf8');
  console.log('[PASS] skeleton.jsx: motion-safe added');
}

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const entry = `## [2026-10-20 09:25] - v1.25.18
### Refactored & Polished
- **Distill Components**: สกัด \`ItemStockHistoryDialog.jsx\` ออกจาก \`Items.jsx\` และ \`StockInOrderDetailModal.jsx\` ออกจาก \`StockIn.jsx\` ลดขนาดหน้าจอหลักและเพิ่มความสะดวกในการบำรุงรักษา
- **Shape Anti-pattern**: กำจัดแอนติแพตเทิร์น Side-tab (\`border-l-4\`) ใน \`Items.jsx\` และ \`Manual.jsx\` ตามข้อกำหนด The Border Definition Rule ใน \`DESIGN.md\`
- **Polish Vector SVG**: แทนที่อักขระลูกศร Unicode \`➔\` ในประวัติสต็อกด้วย Lucide \`ArrowRight\` (100% Vector SVG) พร้อมระบุ \`aria-hidden="true"\` ให้ไอคอนตกแต่ง
- **A11y Typography**: ปรับแต่งระดับความสูงตัวอักษรที่ตกค้าง (\`text-[10px]\`, \`text-[11px]\`) ใน \`Manual.jsx\` และ Dialogs สู่ระดับมาตรฐาน \`text-xs\` ตาม Type Ramp
- **Adapt Mobile**: ปรับแต่ง Touch Target ของปุ่มตาราง Action และปุ่ม Pagination ให้มีขนาดขั้นต่ำ 44×44px บน Mobile/Tablet และเพิ่ม \`overflow-x-auto\` บนตารางรับเข้าพัสดุ
- **Motion Reduction**: ติดตั้ง \`motion-reduce:animate-none\` และ \`motion-safe:animate-pulse\` บนแอนิเมชันจุดสถานะใน Landing Page (\`HeroSection.jsx\`, \`LandingFooter.jsx\`) และ UI Badges (\`StatusBadge.jsx\`, \`UserStatusDot.jsx\`, \`skeleton.jsx\`)

`;

if (changelog.includes('\r\n')) {
  changelog = changelog.replace('# Changelog\r\n\r\n', '# Changelog\r\n\r\n' + entry.replace(/\n/g, '\r\n'));
} else {
  changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + entry);
}
fs.writeFileSync('CHANGELOG.md', changelog, 'utf8');
console.log('[PASS] CHANGELOG.md updated');
