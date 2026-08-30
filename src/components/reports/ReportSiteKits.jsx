import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  FileSpreadsheet, FileText, Layers, Radio, TowerControl, 
  Router, Antenna, RefreshCw, Search 
} from 'lucide-react';
import MicrowaveAntennaIcon from '@/components/icons/MicrowaveAntennaIcon';
import BaseStationTowerIcon from '@/components/icons/BaseStationTowerIcon';
import { utils, writeFile } from 'xlsx';
import toast from 'react-hot-toast';
import { fetchSiteKitsAvailability } from '@/lib/siteKits';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORY_ICONS = {
  '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba': MicrowaveAntennaIcon,
  '793d55c3-4750-42e1-a82e-438e7be131c8': BaseStationTowerIcon,
  '3fb47021-6c65-4a4f-bca4-595280d9ba97': Router,
  '823af00d-99b0-4d9a-943b-0ae29bc83ff0': Antenna,
};

const ReportSiteKits = ({ projects = [] }) => {
  const { can } = useAuth();
  const canExport = can('reports.export');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [siteKits, setSiteKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setRefreshing(true);

      const data = await fetchSiteKitsAvailability(selectedProjectId || null);
      setSiteKits(data || []);
    } catch (error) {
      console.error('Error loading site kits report:', error);
      toast.error('ไม่สามารถโหลดข้อมูลความพร้อมชุดติดตั้งได้');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [selectedProjectId]);

  const filteredItems = useMemo(() => {
    let list = [];
    siteKits.forEach(cat => {
      if (selectedCategoryId !== 'all' && cat.category_id !== selectedCategoryId) {
        return;
      }
      (cat.items || []).forEach(item => {
        const isLimiting = item.is_mandatory && item.sets_possible === cat.complete_sets;
        list.push({
          ...item,
          category_id: cat.category_id,
          category_name: cat.category_name,
          category_complete_sets: cat.complete_sets,
          isLimiting
        });
      });
    });

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i => 
        (i.bom_name && i.bom_name.toLowerCase().includes(q)) ||
        (i.part_number && i.part_number.toLowerCase().includes(q)) ||
        (i.category_name && i.category_name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [siteKits, selectedCategoryId, searchTerm]);

  const handleExportExcel = () => {
    if (!canExport) {
      toast.error('คุณไม่มีสิทธิ์ส่งออกรายงาน Excel (ต้องการสิทธิ์ reports.export)');
      return;
    }
    try {
      const exportData = filteredItems.map((item, index) => ({
        'ลำดับ': index + 1,
        'หมวดหมู่อุปกรณ์': item.category_name,
        'Part Number': item.part_number || '-',
        'รายการอุปกรณ์ตาม BOM': item.bom_name,
        'สเปกจำนวนใช้ต่อไซต์': item.qty_per_site,
        'หน่วย': item.unit || 'ชิ้น',
        'ยอดคงเหลือจริงในสต็อก': item.total_stock,
        'จำนวนชุดที่จัดได้': item.sets_possible,
        'ขาดสำหรับชุดถัดไป': item.missing_for_next_set || 0,
        'สถานะ': item.total_stock === 0 
          ? 'หมดสต็อก' 
          : item.isLimiting 
          ? 'สต็อกจำกัด (Limiting)' 
          : 'พร้อมจัดชุด'
      }));

      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Site_Kits_BOM');

      const wscols = [
        { wch: 8 }, { wch: 25 }, { wch: 20 },
        { wch: 45 }, { wch: 18 }, { wch: 10 }, { wch: 22 },
        { wch: 18 }, { wch: 20 }, { wch: 20 }
      ];
      ws['!cols'] = wscols;

      const dateStr = new Date().toISOString().split('T')[0];
      writeFile(wb, `รายงานความพร้อมชุดติดตั้งไซต์_BOM_${dateStr}.xlsx`);
      toast.success('ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('เกิดข้อผิดพลาดในการส่งออก Excel');
    }
  };

  const handleExportPDF = async () => {
    if (!canExport) {
      toast.error('คุณไม่มีสิทธิ์ส่งออกรายงาน PDF (ต้องการสิทธิ์ reports.export)');
      return;
    }
    try {
      setPdfLoading(true);
      const toastId = toast.loading('กำลังสร้างไฟล์ PDF รายงาน Site Kits BOM...');

      const { SiteKitsReportPDF } = await import('@/lib/pdf-templates.jsx');
      const { pdf } = await import('@react-pdf/renderer');

      const selectedProj = projects.find(p => p.id === selectedProjectId);
      const projectName = selectedProj 
        ? (selectedProj.location ? `${selectedProj.name} (${selectedProj.location})` : selectedProj.name)
        : 'ทุกสถานที่จัดเก็บ (รวมทุกคลัง)';

      const categoryName = selectedCategoryId === 'all'
        ? 'ทั้งหมด 4 หมวด'
        : siteKits.find(c => c.category_id === selectedCategoryId)?.category_name || 'หมวดหมู่ที่เลือก';

      const doc = (
        <SiteKitsReportPDF
          items={filteredItems}
          siteKits={siteKits}
          projectName={projectName}
          categoryName={categoryName}
          searchTerm={searchTerm}
        />
      );

      const blob = await pdf(doc).toBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `รายงานความพร้อมชุดติดตั้งไซต์_BOM_${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('ส่งออกไฟล์ PDF เรียบร้อยแล้ว', { id: toastId });
    } catch (err) {
      console.error('Site Kits PDF Export Error:', err);
      toast.error('เกิดข้อผิดพลาดในการสร้าง PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-3xl border border-border/80 shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            type="button"
            variant={selectedCategoryId === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategoryId('all')}
            className={`rounded-xl text-xs font-bold h-9 cursor-pointer transition-all ${
              selectedCategoryId === 'all' ? 'bg-emerald-600 text-white shadow-xs' : 'border-border/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5 mr-1" /> ทั้งหมด 4 หมวด
          </Button>

          {siteKits.map(cat => {
            const Icon = CATEGORY_ICONS[cat.category_id] || Layers;
            const isSelected = selectedCategoryId === cat.category_id;
            return (
              <Button
                key={cat.category_id}
                type="button"
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategoryId(cat.category_id)}
                className={`rounded-xl text-xs font-bold h-9 gap-1.5 cursor-pointer transition-all ${
                  isSelected ? 'bg-emerald-600 text-white shadow-xs' : 'border-border/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.category_name.split(' ')[0]}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-background/30 font-black">
                  {cat.complete_sets} ชุด
                </span>
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-9 rounded-xl px-3 text-xs bg-background border border-border/80 focus:ring-1 focus:ring-emerald-500 font-medium text-foreground cursor-pointer"
          >
            <option value="">ทุกสถานที่จัดเก็บ (รวมทุกคลัง)</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.location ? `${p.name} (${p.location})` : p.name}
              </option>
            ))}
          </select>

          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="ค้นหาชื่อ / Part No..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-8 text-xs rounded-xl border-border/80 bg-background"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="h-9 px-3 rounded-xl border-border/80 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </Button>

          {canExport && (
            <>
              <Button
                type="button"
                onClick={handleExportPDF}
                disabled={pdfLoading || loading}
                variant="outline"
                size="sm"
                className="h-9 px-3.5 rounded-xl font-semibold text-xs border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>{pdfLoading ? 'กำลังสร้าง PDF...' : 'Export PDF'}</span>
              </Button>

              <Button
                type="button"
                onClick={handleExportExcel}
                className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {siteKits.map(cat => {
          const Icon = CATEGORY_ICONS[cat.category_id] || Layers;
          const isReady = cat.complete_sets > 0;

          return (
            <Card key={cat.category_id} className="rounded-3xl border border-border/80 bg-card/60 backdrop-blur-md shadow-xs">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-foreground">{cat.category_name}</span>
                  </div>
                  <Badge className={`font-black text-xs px-2.5 py-0.5 rounded-full ${
                    isReady ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  }`}>
                    {cat.complete_sets} ชุด
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                  {cat.bottlenecks && cat.bottlenecks.length > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      สต็อกจำกัด: {cat.bottlenecks[0]}
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      พร้อมติดตั้งครบทุกรายการ
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-3xl border border-border/80 bg-card/60 backdrop-blur-md shadow-md overflow-hidden">
        <CardHeader className="border-b border-border/60 pb-3 px-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold tracking-wide uppercase text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>ตารางแจกแจงรายการสเปก BOM และสถานะสต็อกจริง</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                แสดงผล {filteredItems.length} รายการ (ไฮไลต์แถบสีส้มคือรายการที่มีสต็อกจำกัดในการจัดชุด)
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">ลำดับ</th>
                  <th className="py-3 px-4">หมวดหมู่อุปกรณ์</th>
                  <th className="py-3 px-4">Part Number</th>
                  <th className="py-3 px-4">รายการอุปกรณ์ตาม BOM</th>
                  <th className="py-3 px-4 text-center">ใช้ต่อไซต์</th>
                  <th className="py-3 px-4 text-center">สต็อกจริง</th>
                  <th className="py-3 px-4 text-center">จัดได้ (ชุด)</th>
                  <th className="py-3 px-4 text-center">ขาดชุดถัดไป</th>
                  <th className="py-3 px-4 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      ไม่พบข้อมูลรายการอุปกรณ์ตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => (
                    <tr 
                      key={idx}
                      className={`hover:bg-muted/40 transition-colors ${
                        item.isLimiting ? 'bg-amber-500/8 dark:bg-amber-500/15' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-semibold text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-bold text-foreground">
                        {item.category_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                        {item.part_number || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{item.bom_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          จับคู่ในระบบ: {item.db_matched_name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-foreground">
                        {item.qty_per_site} <span className="text-[10px] font-normal text-muted-foreground">{item.unit || 'ชิ้น'}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-foreground">
                        <span className={item.total_stock === 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
                          {item.total_stock?.toLocaleString() || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-black">
                        <span className={`px-2.5 py-1 rounded-lg ${
                          item.sets_possible === 0
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : item.isLimiting
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {item.sets_possible} ชุด
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-muted-foreground">
                        {item.missing_for_next_set > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            +{item.missing_for_next_set} {item.unit || 'ชิ้น'}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            ครบถ้วน
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.total_stock === 0 ? (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px] font-bold">
                            หมดสต็อก
                          </Badge>
                        ) : item.isLimiting ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-bold">
                            สต็อกจำกัด
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                            พร้อม
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportSiteKits;
