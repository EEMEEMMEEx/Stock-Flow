import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Radio, TowerControl, Router, Antenna, 
  AlertTriangle, CheckCircle2, Layers, 
  ChevronRight, AlertCircle
} from 'lucide-react';
import MicrowaveAntennaIcon from '@/components/icons/MicrowaveAntennaIcon';
import BaseStationTowerIcon from '@/components/icons/BaseStationTowerIcon';
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogDescription 
} from '@/components/ui/dialog';

const CATEGORY_ICONS = {
  '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba': MicrowaveAntennaIcon,
  '793d55c3-4750-42e1-a82e-438e7be131c8': BaseStationTowerIcon,
  '3fb47021-6c65-4a4f-bca4-595280d9ba97': Router,
  '823af00d-99b0-4d9a-943b-0ae29bc83ff0': Antenna,
};

const CATEGORY_GRADIENTS = {
  '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba': 'from-blue-600/15 via-blue-500/5 to-transparent border-blue-500/30 text-blue-700 dark:text-blue-400',
  '793d55c3-4750-42e1-a82e-438e7be131c8': 'from-emerald-600/15 via-emerald-500/5 to-transparent border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
  '3fb47021-6c65-4a4f-bca4-595280d9ba97': 'from-indigo-600/15 via-indigo-500/5 to-transparent border-indigo-500/30 text-indigo-700 dark:text-indigo-400',
  '823af00d-99b0-4d9a-943b-0ae29bc83ff0': 'from-amber-600/15 via-amber-500/5 to-transparent border-amber-500/30 text-amber-700 dark:text-amber-400',
};

const SiteKitAvailabilityCards = ({ siteKits = [], loading = false }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-56 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-32 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 rounded-3xl bg-muted/50 border border-border/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!siteKits || siteKits.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold tracking-tight text-foreground">
              ความพร้อมชุดติดตั้งสถานี (Site Installation Kits BOM)
            </h3>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-semibold">
              Real-time BOM
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            คำนวณจำนวนชุดที่จัดได้สมบูรณ์ตามสเปก BOM ของแต่ละไซต์งาน และแจ้งเตือนรายการที่มีสต็อกจำกัด
          </p>
        </div>
      </div>

      {/* 4 Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {siteKits.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.category_id] || Layers;
          const isReady = cat.complete_sets > 0;
          const gradientCls = CATEGORY_GRADIENTS[cat.category_id] || 'from-primary/10 via-primary/5 to-transparent border-border/80 text-primary';

          return (
            <Card
              key={cat.category_id}
              onClick={() => setSelectedCategory(cat)}
              className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 backdrop-blur-md shadow-xs hover:shadow-md hover:border-emerald-500/40 transition-all duration-300 cursor-pointer flex flex-col justify-between"
            >
              {/* Subtle top color gradient accent */}
              <div className={`absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r ${isReady ? 'from-emerald-500 to-teal-400' : 'from-rose-500 to-amber-500'}`} />

              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center bg-gradient-to-br ${gradientCls} border shrink-0 group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-bold truncate text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {cat.category_name}
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground truncate">
                        BOM {cat.total_items_in_bom || cat.items?.length || 0} รายการ
                      </p>
                    </div>
                  </div>

                  {/* Complete Sets Badge */}
                  <div className="shrink-0 text-right">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${
                      isReady 
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40' 
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40'
                    }`}>
                      {isReady ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      )}
                      <span>{cat.complete_sets} ชุด</span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-5 pb-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
                {/* Bottleneck Summary Box */}
                <div className="rounded-2xl p-2.5 bg-muted/40 border border-border/50 text-[11px] space-y-1.5 min-h-[58px]">
                  <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                    <AlertCircle className={`w-3.5 h-3.5 ${isReady ? 'text-amber-500' : 'text-rose-500'}`} />
                    <span>{isReady ? 'สต็อกจำกัดสำหรับชุดถัดไป:' : 'สต็อกจำกัด (ยังจัดชุดไม่ได้):'}</span>
                  </div>
                  <div className="text-foreground font-medium line-clamp-2 leading-relaxed">
                    {cat.bottlenecks && cat.bottlenecks.length > 0 ? (
                      cat.bottlenecks.slice(0, 2).join(', ') + (cat.bottlenecks.length > 2 ? ` (+อีก ${cat.bottlenecks.length - 2} รายการ)` : '')
                    ) : (
                      'พร้อมจัดชุดทุกรายการ'
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground pt-1 border-t border-border/40 group-hover:text-foreground transition-colors">
                  <span>ดูสเปกและสต็อก BOM</span>
                  <div className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                    <span>เปิดดู</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed BOM Breakdown Dialog Modal */}
      <Dialog open={!!selectedCategory} onOpenChange={(open) => !open && setSelectedCategory(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col rounded-3xl p-0 overflow-hidden border-border/80">
          <DialogHeader className="p-6 pb-4 border-b border-border/60 bg-muted/20">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  {selectedCategory && (
                    React.createElement(CATEGORY_ICONS[selectedCategory.category_id] || Layers, { className: 'w-5 h-5' })
                  )}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    {selectedCategory?.category_name} — รายละเอียดสเปก BOM
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    เทียบยอดคงเหลือสต็อกจริงกับจำนวนที่ต้องใช้ต่อ 1 ไซต์งาน
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white">
                  จัดได้ {selectedCategory?.complete_sets} ชุดสมบูรณ์
                </Badge>
              </div>
            </div>
          </DialogHeader>

          {/* Table Content */}
          <div className="flex-1 overflow-y-auto p-6 pt-2">
            <div className="rounded-2xl border border-border/70 overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/70 text-muted-foreground font-bold border-b border-border/70">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">ลำดับ</th>
                    <th className="py-2.5 px-3">รายการอุปกรณ์ตาม BOM</th>
                    <th className="py-2.5 px-3 text-center w-24">ใช้ต่อไซต์</th>
                    <th className="py-2.5 px-3 text-center w-24">สต็อกจริง</th>
                    <th className="py-2.5 px-3 text-center w-24">จัดได้ (ชุด)</th>
                    <th className="py-2.5 px-3 text-center w-24">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {selectedCategory?.items?.map((item, idx) => {
                    const isLimiting = item.is_mandatory && item.sets_possible === selectedCategory.complete_sets;
                    return (
                      <tr 
                        key={idx} 
                        className={`hover:bg-muted/30 transition-colors ${
                          isLimiting ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center font-semibold text-muted-foreground">
                          {item.po_seq || idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-foreground">{item.bom_name}</div>
                          {item.part_number && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              Part: {item.part_number}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-foreground">
                          {item.qty_per_site} <span className="text-[10px] font-normal text-muted-foreground">{item.unit || 'ชิ้น'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-foreground">
                          <span className={item.total_stock === 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
                            {item.total_stock?.toLocaleString() || 0}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-black">
                          <span className={`px-2 py-0.5 rounded-md ${
                            item.sets_possible === 0
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : isLimiting
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          }`}>
                            {item.sets_possible} ชุด
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.total_stock === 0 ? (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px]">
                              หมดสต็อก
                            </Badge>
                          ) : isLimiting ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                              สต็อกจำกัด
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                              พร้อม
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SiteKitAvailabilityCards;
