import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  ChevronRight, 
  Router, 
  Antenna, 
  RadioTower, 
  TowerControl, 
  Boxes, 
  Package, 
  Layers 
} from 'lucide-react';

/**
 * Resolver for category visual styling and Lucide icons (100% SVG, Zero Emojis)
 */
export const resolveCategoryVisuals = (category) => {
  const id = category?.category_id || '';
  const rawName = (category?.category_name || category?.name || '').toLowerCase();
  const code = (category?.code || '').toLowerCase();

  // Known Category ID Mappings & Name Heuristics
  // 1. MW (Microwave)
  if (id === '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba' || rawName.includes('mw') || rawName.includes('microwave')) {
    return {
      Icon: RadioTower,
      gradientCls: 'from-blue-600/15 via-blue-500/5 to-transparent border-blue-500/30 text-blue-700 dark:text-blue-400',
    };
  }

  // 2. BS (Base Station)
  if (id === '793d55c3-4750-42e1-a82e-438e7be131c8' || rawName.includes('bs') || rawName.includes('base station')) {
    return {
      Icon: TowerControl,
      gradientCls: 'from-emerald-600/15 via-emerald-500/5 to-transparent border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
    };
  }

  // 3. AGW (Analog Gateway)
  if (id === '3fb47021-6c65-4a4f-bca4-595280d9ba97' || rawName.includes('agw') || rawName.includes('gateway')) {
    return {
      Icon: Router,
      gradientCls: 'from-indigo-600/15 via-indigo-500/5 to-transparent border-indigo-500/30 text-indigo-700 dark:text-indigo-400',
    };
  }

  // 4. Fixed Radio (ลูกข่ายประจำที่)
  if (id === '823af00d-99b0-4d9a-943b-0ae29bc83ff0' || rawName.includes('fixed') || rawName.includes('ลูกข่าย') || code === 'fixed') {
    return {
      Icon: Antenna,
      gradientCls: 'from-amber-600/15 via-amber-500/5 to-transparent border-amber-500/30 text-amber-700 dark:text-amber-400',
    };
  }

  // 5. Equipment Set (ชุดอุปกรณ์รวม)
  if (id === '8986d991-42ef-4c79-8d38-7790e163117e' || rawName.includes('ชุดอุปกรณ์รวม') || rawName.includes('equipment set') || rawName.includes('อุปกรณ์รวม')) {
    return {
      Icon: Boxes,
      gradientCls: 'from-purple-600/15 via-purple-500/5 to-transparent border-purple-500/30 text-purple-700 dark:text-purple-400',
    };
  }

  // Dynamic / Future Category fallback with deterministic color assignment
  const PALETTE = [
    'from-teal-600/15 via-teal-500/5 to-transparent border-teal-500/30 text-teal-700 dark:text-teal-400',
    'from-cyan-600/15 via-cyan-500/5 to-transparent border-cyan-500/30 text-cyan-700 dark:text-cyan-400',
    'from-violet-600/15 via-violet-500/5 to-transparent border-violet-500/30 text-violet-700 dark:text-violet-400',
    'from-rose-600/15 via-rose-500/5 to-transparent border-rose-500/30 text-rose-700 dark:text-rose-400',
    'from-sky-600/15 via-sky-500/5 to-transparent border-sky-500/30 text-sky-700 dark:text-sky-400'
  ];
  const charCodeSum = (id + rawName).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const selectedGradient = PALETTE[charCodeSum % PALETTE.length];

  return {
    Icon: rawName.includes('กล่อง') || rawName.includes('อุปกรณ์') ? Package : Layers,
    gradientCls: selectedGradient,
  };
};

/**
 * Reusable Category Card component for Site Installation Kits BOM
 */
const SiteKitCategoryCard = ({
  category,
  canEditBom = false,
  onSelect,
  className = ''
}) => {
  if (!category) return null;

  const { Icon, gradientCls } = resolveCategoryVisuals(category);
  const completeSets = Number(category.complete_sets) || 0;
  const isReady = completeSets > 0;
  const itemCount = category.total_items_in_bom || category.items?.length || 0;
  const bottlenecks = category.bottlenecks || [];

  return (
    <Card
      onClick={() => onSelect && onSelect(category)}
      className={`group relative overflow-hidden rounded-xl border border-border bg-card shadow-xs hover:border-emerald-500/50 hover:shadow-xs transition-all duration-150 cursor-pointer flex flex-col justify-between ${className}`}
    >
      {/* Subtle top color gradient accent */}
      <div 
        className={`absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r ${
          isReady ? 'from-emerald-500 to-teal-400' : 'from-rose-500 to-amber-500'
        }`} 
      />

      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${gradientCls} border shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-bold truncate text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {category.category_name}
                </CardTitle>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                <span>BOM {itemCount} รายการ</span>
                {category.is_customized && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                    • ปรับแต่งแล้ว
                  </span>
                )}
              </div>
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
              <span>{completeSets} ชุด</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
        {/* Bottleneck Summary Box */}
        <div className="rounded-lg p-2.5 bg-muted/40 border border-border/50 text-[11px] space-y-1.5 min-h-[58px]">
          <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <AlertCircle className={`w-3.5 h-3.5 ${isReady ? 'text-amber-500' : 'text-rose-500'}`} />
            <span>{isReady ? 'สต็อกจำกัดสำหรับชุดถัดไป:' : 'สต็อกจำกัด (ยังจัดชุดไม่ได้):'}</span>
          </div>
          <div className="text-foreground font-medium line-clamp-2 leading-relaxed">
            {bottlenecks.length > 0 ? (
              bottlenecks.slice(0, 2).join(', ') + (bottlenecks.length > 2 ? ` (+อีก ${bottlenecks.length - 2} รายการ)` : '')
            ) : (
              'พร้อมจัดชุดทุกรายการ'
            )}
          </div>
        </div>

        {/* Footer Action */}
        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground pt-1 border-t border-border/40 group-hover:text-foreground transition-colors">
          <span>{canEditBom ? 'ดูสเปก / แก้ไข BOM' : 'ดูสเปกและสต็อก BOM'}</span>
          <div className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
            <span>{canEditBom ? 'จัดการ' : 'เปิดดู'}</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(SiteKitCategoryCard);
