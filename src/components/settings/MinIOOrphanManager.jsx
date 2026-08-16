import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  FolderKanban, Search, Download, Trash2, ShieldAlert, CheckCircle2, 
  AlertTriangle, RefreshCw, HardDrive, FileText, CheckSquare, Square
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';


const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const parseJsonResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (res.status === 404) {
      throw new Error('ไม่พบเอนด์พอยต์ API ฝั่งเซิร์ฟเวอร์ (404 Not Found บนพอร์ต 3001)');
    }
    throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (HTTP ${res.status}: ไม่ได้รับข้อมูลรูปแบบ JSON)`);
  }
  return await res.json();
};

const safeFetchApi = async (urlPath, options) => {
  try {
    // Try relative URL first (proxied by Vite) then fallback to absolute backend URL
    let res = await fetch(urlPath, options);
    if (res.status === 404 && !urlPath.startsWith('http')) {
      res = await fetch(`${API_BASE_URL}${urlPath}`, options);
    }
    return res;
  } catch (err) {
    if (!urlPath.startsWith('http')) {
      return await fetch(`${API_BASE_URL}${urlPath}`, options);
    }
    throw err;
  }
};

const MinIOOrphanManager = ({ canUpdate }) => {
  const [prefix, setPrefix] = useState('jobs/');
  const [ageThreshold, setAgeThreshold] = useState('30');
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [scanResult, setScanResult] = useState(null); // { summary, objects }
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleScan = async (e) => {
    e?.preventDefault();
    try {
      setScanning(true);
      setScanResult(null);
      setSelectedKeys(new Set());

      const res = await safeFetchApi('/api/minio/scan-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix,
          ageThresholdDays: Number(ageThreshold)
        })
      });

      const data = await parseJsonResponse(res);

      if (!res.ok || data.success === false) {
        const errMsg = data.error?.message || data.error || 'เกิดข้อผิดพลาดในการสแกนไฟล์ขยะ';
        throw new Error(errMsg);
      }

      const files = data.data?.files || data.objects || [];
      const total = data.data?.total ?? files.length;
      const totalSize = data.data?.totalOrphanSize ?? files.reduce((s, o) => s + o.size, 0);

      const normalizedResult = {
        summary: {
          orphanCount: total,
          totalOrphanSize: totalSize
        },
        objects: files
      };

      setScanResult(normalizedResult);
      toast.success(`สแกนพบไฟล์ขยะ ${total} รายการ (${formatBytes(totalSize)})`);

    } catch (err) {
      console.error('MinIO Scan Error:', err);
      toast.error(err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์สแกน MinIO ได้');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (!scanResult?.objects) return;
    if (selectedKeys.size === scanResult.objects.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(scanResult.objects.map(o => o.key)));
    }
  };

  const handleToggleSelectFile = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExportCSV = async () => {
    if (!scanResult?.objects || scanResult.objects.length === 0) {
      return toast.error('ไม่มีข้อมูลการสแกนสำหรับส่งออก CSV');
    }

    try {
      setExporting(true);
      const scanPayload = scanResult.objects.map(o => ({
        ...o,
        selected: selectedKeys.has(o.key)
      }));

      const res = await safeFetchApi('/api/minio/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanResults: scanPayload })
      });

      if (!res.ok) {
        const data = await parseJsonResponse(res);
        throw new Error(data.error?.message || 'เกิดข้อผิดพลาดในการสร้างไฟล์ CSV');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `minio_orphan_files_${prefix.replace(/[\/\\]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('ส่งออกรายงาน CSV สำเร็จแล้ว');
    } catch (err) {
      console.error('Export CSV Error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์ CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) {
      return toast.error('กรุณาเลือกไฟล์ขยะที่ต้องการลบอย่างน้อย 1 รายการ');
    }

    try {
      setDeleting(true);
      const keysArray = Array.from(selectedKeys);

      const res = await safeFetchApi('/api/minio/delete-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys: keysArray,
          prefix,
          ageThresholdDays: Number(ageThreshold)
        })
      });

      const data = await parseJsonResponse(res);

      if (!res.ok || data.success === false) {
        const errMsg = data.error?.message || data.error || 'เกิดข้อผิดพลาดในการลบไฟล์ขยะ';
        throw new Error(errMsg);
      }

      const deletedCount = data.data?.summary?.totalDeleted ?? data.summary?.totalDeleted ?? keysArray.length;
      toast.success(`ลบไฟล์ขยะสำเร็จเรียบร้อย ${deletedCount} รายการ`);
      setIsConfirmOpen(false);

      // Refresh scan
      handleScan();

    } catch (err) {
      console.error('Delete Orphans Error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการลบไฟล์ขยะ MinIO');
    } finally {
      setDeleting(false);
    }
  };


  const selectedObjectsList = (scanResult?.objects || []).filter(o => selectedKeys.has(o.key));
  const totalSelectedBytes = selectedObjectsList.reduce((sum, o) => sum + o.size, 0);

  return (
    <div className="p-4 rounded-2xl neu-pressed bg-white/40 dark:bg-black/20 space-y-4">
      <div className="flex items-center gap-2 border-b border-border/20 pb-3">
        <FolderKanban className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-foreground">
            การจัดการไฟล์ขยะ MinIO/S3 (MinIO Orphan Files Management)
          </h4>
          <p className="text-[11px] text-muted-foreground">
            สแกนและลบไฟล์ขยะตกค้างใน MinIO/S3 Bucket ที่ไม่ได้ถูกอ้างอิงอยู่ในฐานข้อมูลระบบอย่างปลอดภัย
          </p>
        </div>
      </div>

      {/* Controls Form */}
      <form onSubmit={handleScan} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label htmlFor="minio_prefix" className="text-xs font-semibold text-foreground">
              โฟลเดอร์ / Prefix
            </Label>
            <Input
              id="minio_prefix"
              placeholder="jobs/ หรือ users/"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="mt-1 neu-pressed bg-transparent text-xs"
            />
          </div>

          <div>
            <Label htmlFor="minio_age" className="text-xs font-semibold text-foreground">
              เกณฑ์อายุไฟล์ขยะ (Retention Threshold)
            </Label>
            <select
              id="minio_age"
              value={ageThreshold}
              onChange={(e) => setAgeThreshold(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background/80 px-3 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="7">7 วัน (ไฟล์เก่ากว่า 7 วัน)</option>
              <option value="14">14 วัน (ไฟล์เก่ากว่า 14 วัน)</option>
              <option value="30">30 วัน (ไฟล์เก่ากว่า 30 วัน)</option>
              <option value="60">60 วัน (ไฟล์เก่ากว่า 60 วัน)</option>
              <option value="90">90 วัน (ไฟล์เก่ากว่า 90 วัน)</option>
              <option value="180">180 วัน (ไฟล์เก่ากว่า 180 วัน)</option>
              <option value="365">365 วัน (ไฟล์เก่ากว่า 1 ปี)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={scanning}
              className="flex-1 neu-primary text-xs font-semibold h-9 flex items-center justify-center gap-1.5"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  กำลังสแกน...
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  สแกนไฟล์ขยะ (Scan)
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={exporting || !scanResult?.objects || scanResult.objects.length === 0}
              onClick={handleExportCSV}
              className="neu-button text-xs font-semibold h-9 flex items-center gap-1.5 text-emerald-600"
            >
              <Download className="w-3.5 h-3.5" />
              ส่งออก CSV
            </Button>
          </div>
        </div>
      </form>

      {/* Scan Results Section */}
      {scanResult && (
        <div className="space-y-3 pt-2">
          {/* Summary Bar */}
          <div className="p-3 rounded-xl bg-background/60 border border-border/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <HardDrive className="w-4 h-4 text-amber-500" />
                พบไฟล์ขยะทั้งหมด: <strong className="text-amber-600">{scanResult.summary.orphanCount}</strong> รายการ ({formatBytes(scanResult.summary.totalOrphanSize)})
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">
                เลือกแล้ว: <strong className="text-primary">{selectedKeys.size}</strong> รายการ ({formatBytes(totalSelectedBytes)})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={!canUpdate || selectedKeys.size === 0 || deleting}
                onClick={() => setIsConfirmOpen(true)}
                className="text-xs h-8 px-3 flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบไฟล์ขยะที่เลือก ({selectedKeys.size})
              </Button>
            </div>
          </div>

          {/* Results Table */}
          {scanResult.objects.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground space-y-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
              <p className="font-semibold text-foreground">ไม่พบไฟล์ขยะตกค้างในโฟลเดอร์นี้</p>
              <p className="text-[11px]">ไฟล์ทั้งหมดในโฟลเดอร์มีการถูกอ้างอิงในฐานข้อมูล หรือยังมีอายุไม่ถึงเกณฑ์ที่กำหนด</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 overflow-hidden bg-background/40 max-h-80 overflow-y-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-secondary/80 backdrop-blur text-secondary-foreground text-[11px] font-semibold border-b border-border/30">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedKeys.size === scanResult.objects.length && scanResult.objects.length > 0}
                        onChange={handleToggleSelectAll}
                        className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                    </th>
                    <th className="p-2.5">Object Key / File Path</th>
                    <th className="p-2.5">ขนาดไฟล์</th>
                    <th className="p-2.5">แก้ไขล่าสุด</th>
                    <th className="p-2.5">อายุไฟล์</th>
                    <th className="p-2.5 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 text-[11px]">
                  {scanResult.objects.map((item) => (
                    <tr 
                      key={item.key} 
                      className={`hover:bg-primary/5 transition-colors ${selectedKeys.has(item.key) ? 'bg-primary/10' : ''}`}
                    >
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(item.key)}
                          onChange={() => handleToggleSelectFile(item.key)}
                          className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                      </td>
                      <td className="p-2.5 font-mono text-[10px] text-foreground max-w-xs truncate" title={item.key}>
                        {item.key}
                      </td>
                      <td className="p-2.5 font-mono text-muted-foreground whitespace-nowrap">
                        {formatBytes(item.size)}
                      </td>
                      <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(item.lastModified).toLocaleString('th-TH')}
                      </td>
                      <td className="p-2.5 font-semibold text-amber-600 whitespace-nowrap">
                        {item.ageDays} วัน
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                          <span>ORPHAN (ขยะ)</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog for Destructive Deletion */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="max-w-md neu-flat border-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              ยืนยันการลบไฟล์ขยะ MinIO/S3
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1 space-y-2">
              <span className="block font-semibold text-foreground">
                คุณกำลังจะลบไฟล์ขยะจำนวน <strong className="text-red-600 font-bold">{selectedKeys.size}</strong> รายการ ({formatBytes(totalSelectedBytes)}) ออกจาก MinIO/S3 Bucket อย่างถาวร
              </span>
              <span className="block text-[11px]">
                ไฟล์ที่ถูกลบจะไม่สามารถเรียกคืนได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* List of files to delete preview */}
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 max-h-40 overflow-y-auto space-y-1 font-mono text-[10px] text-foreground">
            {selectedObjectsList.slice(0, 5).map(o => (
              <div key={o.key} className="truncate text-muted-foreground">
                • {o.key} ({formatBytes(o.size)})
              </div>
            ))}
            {selectedObjectsList.length > 5 && (
              <div className="text-red-600 font-semibold pt-1">
                ...และอีก {selectedObjectsList.length - 5} รายการ
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsConfirmOpen(false)} disabled={deleting}>
              ยกเลิก
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteSelected} disabled={deleting} className="flex items-center gap-1.5">
              {deleting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  กำลังลบไฟล์...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  ยืนยันลบไฟล์อย่างถาวร
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinIOOrphanManager;
