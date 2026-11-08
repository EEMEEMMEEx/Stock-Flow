import fs from 'node:fs';

let code = fs.readFileSync('src/pages/Scrap.jsx', 'utf8');

// 1. In fetchOutboundClaims: change caim_inbound_status to 'none'
code = code.replace(
  /\.neq\('caim_sync_status', 'synced'\)\s*\.eq\('repair_resolution_status', 'unresolved'\)\s*\.in\('caim_inbound_status', \['internal_repair', 'retried_internal'\]\)/,
  `.neq('caim_sync_status', 'synced')\r\n        .eq('repair_resolution_status', 'unresolved')\r\n        .eq('caim_inbound_status', 'none')`
);

// 2. In fetchPendingDamaged: remove item_condition filter
code = code.replace(
  /\.in\('item_condition', \['damaged', 'needs_repair'\]\)\s*\.eq\('is_reverted', false\)/,
  `.eq('is_reverted', false)`
);

// 3. Fix Modals 2, 3, 4 onSuccess callback
code = code.replace(
  /log=\{selectedSerialLog\}\s*order=\{selectedOrder\}\s*onResolved=\{/g,
  `log={selectedSerialLog}\r\n          order={selectedOrder}\r\n          onSuccess={`
);

code = code.replace(
  /log=\{selectedClaimSubmitLog\}\s*onResolved=\{/g,
  `log={selectedClaimSubmitLog}\r\n          onSuccess={`
);

code = code.replace(
  /log=\{selectedInboundLog\}\s*onResolved=\{/g,
  `log={selectedInboundLog}\r\n          onSuccess={`
);

fs.writeFileSync('src/pages/Scrap.jsx', code, 'utf8');
console.log('Script patch 2 complete.');
