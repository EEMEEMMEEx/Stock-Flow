import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

console.log('====================================================');
console.log('   Repair Project Dropdown & Fallback Verification  ');
console.log('====================================================');

const MODAL_PATH = new URL('../src/components/checkouts/RepairResolutionModal.jsx', import.meta.url);
const SELECTOR_PATH = new URL('../src/components/common/ProjectLocationSelector.jsx', import.meta.url);
const TH_PATH = new URL('../src/i18n/locales/th.js', import.meta.url);
const EN_PATH = new URL('../src/i18n/locales/en.js', import.meta.url);
const PKG_PATH = new URL('../package.json', import.meta.url);

const modal = readFileSync(MODAL_PATH, 'utf8');
const selector = readFileSync(SELECTOR_PATH, 'utf8');
const th = readFileSync(TH_PATH, 'utf8');
const en = readFileSync(EN_PATH, 'utf8');
const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));

let failures = 0;
const check = (desc, cond) => {
  if (cond) {
    console.log(`[PASS] ${desc}`);
  } else {
    failures++;
    console.error(`[FAIL] ${desc}`);
  }
};

// 1. ProjectLocationSelector capabilities
check('ProjectLocationSelector supports id prop', /id,?\s*projects\s*=/.test(selector) || /export const ProjectLocationSelector\s*=\s*\(\{\s*id/m.test(selector));
check('ProjectLocationSelector assigns id to <select>', /<select[\s\S]*?id=\{id\}/.test(selector));
check('ProjectLocationSelector supports disabled prop', /disabled\s*=\s*false/.test(selector) && /disabled=\{disabled\}/.test(selector));
check('ProjectLocationSelector supports allowAll prop with "all" option value', /allowAll[\s\S]*?<option value="all">/.test(selector));
check('ProjectLocationSelector groups projects by name + code into optgroups', /groupedProjects[\s\S]*?<optgroup/.test(selector));

// 2. RepairResolutionModal integration
check('RepairResolutionModal imports ProjectLocationSelector', /import\s+\{\s*ProjectLocationSelector\s*\}\s+from\s+'@\/components\/common\/ProjectLocationSelector'/.test(modal));
check('RepairResolutionModal passes id="repair-project"', /<ProjectLocationSelector[\s\S]*?id="repair-project"/.test(modal));
check('RepairResolutionModal passes allowAll={true}', /allowAll=\{true\}/.test(modal));
check('RepairResolutionModal passes allLabel with localized text', /allLabel=\{t\('withdrawals\.allLocationsLabel'/.test(modal));
check('RepairResolutionModal preserves sm:col-span-2 wrapper', /<div className="space-y-1\.5 sm:col-span-2">[\s\S]*?<ProjectLocationSelector/.test(modal));
check('RepairResolutionModal fetches location and description columns', /\.select\('id,\s*name,\s*project_code,\s*location,\s*description,\s*status'\)/.test(modal));

// 3. Fallback resolution logic for 'all'
check('RepairResolutionModal resolves "all" to fallback destination project', /const resolvedProjectId\s*=\s*\(projectId && projectId !== 'all'\)\s*\?\s*projectId\s*:\s*\(returnLog\?\.destination_project_id \|\| order\?\.project_id \|\| projects\[0\]\?\.id \|\| null\);/.test(modal));
check('RepairResolutionModal passes resolvedProjectId in submit payload', /project_id:\s*resolvedProjectId/.test(modal));
check('RepairResolutionModal resolves targetProjectId for spare parts when projectId is "all"', /const targetProjectId\s*=\s*\(projectId && projectId !== 'all'\)/.test(modal));
check('RepairResolutionModal displays hint when "all" is selected', /projectId === 'all' &&[\s\S]*?repairAllProjectsHint/.test(modal));

// 4. i18n keys
check('repairAllProjectsHint exists in th.js', /"repairAllProjectsHint":\s*"[^"]+"/.test(th));
check('repairAllProjectsHint exists in en.js', /"repairAllProjectsHint":\s*"[^"]+"/.test(en));

// 5. Versioning
check('package.json version is 1.24.4', pkg.version === '1.24.4');

console.log('----------------------------------------------------');
if (failures === 0) {
  console.log('[ALL PASS] All 16 checks passed successfully!');
} else {
  console.error(`[FAIL] ${failures} checks failed!`);
  process.exit(1);
}
