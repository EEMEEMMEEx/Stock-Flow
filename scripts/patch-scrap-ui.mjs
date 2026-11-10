import fs from 'node:fs';

let code = fs.readFileSync('src/pages/Scrap.jsx', 'utf8');

// 1. Add handleSendToInternalRepair handler
const sendRepairHandler = `  // Handle transfer to internal repair queue (Single Triage)
  const handleSendToInternalRepair = async (log) => {
    try {
      const { error } = await supabase.rpc('mark_return_for_internal_repair', {
        p_return_log_id: log.id
      });
      if (error) throw error;
      toast.success(t('scrap.sentToInternalRepairSuccess', 'ย้ายอุปกรณ์เข้าคิวซ่อมภายในเรียบร้อยแล้ว'));
      loadData();
    } catch (err) {
      console.error('mark_return_for_internal_repair failed:', err);
      toast.error(err.message || t('scrap.sentToInternalRepairFailed', 'เกิดข้อผิดพลาดในการย้ายเข้าคิวซ่อมภายใน'));
    }
  };

  // Filtered lists`;

code = code.replace('  // Filtered lists', sendRepairHandler);

// 2. In filteredOutbound: use resolveDefectiveSerial(item)
code = code.replace(
  '(item.checkout_items?.serial_number || item.replaced_serial_number || \'\').toLowerCase().includes(searchTerm.toLowerCase())',
  'resolveDefectiveSerial(item).toLowerCase().includes(searchTerm.toLowerCase())'
);

// 3. In filteredInbound: support replacedNewSerialNo
code = code.replace(
  'const serialNo = payload.newSerialNo || payload.serialNo || item.replaced_serial_number || item.checkout_items?.serial_number || \'\';',
  'const serialNo = payload.newSerialNo || payload.replacedNewSerialNo || payload.serialNo || resolveDefectiveSerial(item);'
);

// 4. In filteredPending: use resolveDefectiveSerial(item)
code = code.replace(
  '(item.checkout_items?.serial_number || item.replaced_serial_number || \'\').toLowerCase().includes(searchTerm.toLowerCase())',
  'resolveDefectiveSerial(item).toLowerCase().includes(searchTerm.toLowerCase())'
);

// 5. In Tab 1 row map: use resolveDefectiveSerial and destination_project
code = code.replace(
  'const itemSerial = log.checkout_items?.serial_number || log.replaced_serial_number || \'\';\r\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\r\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\r\n                    const projectName = log.checkout_orders?.projects?.name || \'-\';',
  'const itemSerial = resolveDefectiveSerial(log);\r\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\r\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\r\n                    const projectName = log.destination_project?.name || log.checkout_orders?.projects?.name || \'-\';'
);

// Also try with LF
code = code.replace(
  'const itemSerial = log.checkout_items?.serial_number || log.replaced_serial_number || \'\';\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\n                    const projectName = log.checkout_orders?.projects?.name || \'-\';',
  'const itemSerial = resolveDefectiveSerial(log);\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\n                    const projectName = log.destination_project?.name || log.checkout_orders?.projects?.name || \'-\';'
);

// 6. In Tab 1 actions: add "ส่งซ่อมภายใน" button
const tab1ActionsOld = `                            {canSendClaim ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={!hasSerial}
                                onClick={() => handleOpenClaimSubmitModal(log)}`;

const tab1ActionsNew = `                            {canResolveRepair && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleSendToInternalRepair(log)}
                                className="h-7 px-2 text-[11px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                                title={t('scrap.sendToInternalRepairTitle', 'ส่งเข้าคิวซ่อมภายในคลัง')}
                              >
                                <Wrench className="w-3 h-3" />
                                <span>{t('scrap.sendToInternalRepairAction', 'ส่งซ่อมภายใน')}</span>
                              </Button>
                            )}

                            {canSendClaim ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={!hasSerial}
                                onClick={() => handleOpenClaimSubmitModal(log)}`;

code = code.replace(tab1ActionsOld.replace(/\n/g, '\r\n'), tab1ActionsNew.replace(/\n/g, '\r\n'));
code = code.replace(tab1ActionsOld, tab1ActionsNew);

// 7. In Tab 2: update projectName and technicianNotes
code = code.replace(
  'const serialNo = payload.newSerialNo || payload.serialNo || log.replaced_serial_number || log.checkout_items?.serial_number || \'-\';\r\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\r\n                    const projectName = log.checkout_orders?.projects?.name || \'-\';',
  'const serialNo = payload.newSerialNo || payload.replacedNewSerialNo || payload.serialNo || formatDefectiveSerial(log);\r\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\r\n                    const projectName = log.destination_project?.name || log.checkout_orders?.projects?.name || \'-\';'
);
code = code.replace(
  'const serialNo = payload.newSerialNo || payload.serialNo || log.replaced_serial_number || log.checkout_items?.serial_number || \'-\';\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\n                    const projectName = log.checkout_orders?.projects?.name || \'-\';',
  'const serialNo = payload.newSerialNo || payload.replacedNewSerialNo || payload.serialNo || formatDefectiveSerial(log);\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\n                    const projectName = log.destination_project?.name || log.checkout_orders?.projects?.name || \'-\';'
);

code = code.replace(
  'title={payload.notes || \'\'}>\r\n                          {payload.notes || \'-\'}',
  'title={payload.technicianNotes || payload.notes || \'\'}>\r\n                          {payload.technicianNotes || payload.notes || \'-\'}'
);
code = code.replace(
  'title={payload.notes || \'\'}>\n                          {payload.notes || \'-\'}',
  'title={payload.technicianNotes || payload.notes || \'\'}>\n                          {payload.technicianNotes || payload.notes || \'-\'}'
);

// 8. In Tab 3: use formatDefectiveSerial and destination_project
code = code.replace(
  'const itemSerial = log.checkout_items?.serial_number || log.replaced_serial_number || \'-\';\r\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\r\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\r\n                    const projectName = log.checkout_orders?.projects?.name || \'-\';',
  'const itemSerial = formatDefectiveSerial(log);\r\n                    const hasSerial = Boolean(resolveDefectiveSerial(log));\r\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\r\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\r\n                    const projectName = log.destination_project?.name || log.checkout_orders?.projects?.name || \'-\';'
);
code = code.replace(
  'const itemSerial = log.checkout_items?.serial_number || log.replaced_serial_number || \'-\';\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\n                    const projectName = log.checkout_orders?.projects?.name || \'-\';',
  'const itemSerial = formatDefectiveSerial(log);\n                    const hasSerial = Boolean(resolveDefectiveSerial(log));\n                    const orderNumber = log.checkout_orders?.order_number || \'-\';\n                    const borrowerName = log.checkout_orders?.borrower_name || \'\';\n                    const projectName = log.destination_project?.name || log.checkout_orders?.projects?.name || \'-\';'
);

// 9. In Tab 3 actions: disable send claim if !hasSerial and add specify S/N
const tab3ActionsOld = `                            {!log.caim_ticket_id && canSendClaim && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenClaimSubmitModal(log)}
                                className="h-8 px-2.5 text-xs gap-1 font-semibold border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>{t('scrap.sendCaimAction')}</span>
                              </Button>
                            )}`;

const tab3ActionsNew = `                            {!log.caim_ticket_id && !hasSerial && canEditSerial && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenEditSerialModal(log)}
                                className="h-8 px-2 text-xs gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                              >
                                <Hash className="w-3.5 h-3.5" />
                                <span>{t('scrap.specifySerial', 'ระบุ S/N')}</span>
                              </Button>
                            )}
                            {!log.caim_ticket_id && canSendClaim && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!hasSerial}
                                onClick={() => handleOpenClaimSubmitModal(log)}
                                className="h-8 px-2.5 text-xs gap-1 font-semibold border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>{t('scrap.sendCaimAction')}</span>
                              </Button>
                            )}`;

code = code.replace(tab3ActionsOld.replace(/\n/g, '\r\n'), tab3ActionsNew.replace(/\n/g, '\r\n'));
code = code.replace(tab3ActionsOld, tab3ActionsNew);

fs.writeFileSync('src/pages/Scrap.jsx', code, 'utf8');
console.log('Patch UI complete.');
