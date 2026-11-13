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
import { useTranslation } from '@/i18n';

/**
 * Resolver for category visual styling and Lucide icons (100% SVG, Zero Emojis)
 */
// eslint-disable-next-line react-refresh/only-export-components
export const resolveCategoryVisuals = (category) => {
  const id = category?.category_id || '';
  const rawName = (category?.category_name || category?.name || '').toLowerCase();
  const code = (category?.code || '').toLowerCase();

  // Known Category ID Mappings & Name Heuristics
  // 1. MW (Microwave)
  if (id === '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba' || rawName.includes('mw') || rawName.includes('microwave')) {
    return { Icon: RadioTower };
  }

  // 2. BS (Base Station)
  if (id === '793d55c3-4750-42e1-a82e-438e7be131c8' || rawName.includes('bs') || rawName.includes('base station')) {
    return { Icon: TowerControl };
  }

  // 3. AGW (Analog Gateway)
  if (id === '3fb47021-6c65-4a4f-bca4-595280d9ba97' || rawName.includes('agw') || rawName.includes('gateway')) {
    return { Icon: Router };
  }

  // 4. Fixed Radio (ลูกข่ายประจำที่)
  if (id === '823af00d-99b0-4d9a-943b-0ae29bc83ff0' || rawName.includes('fixed') || rawName.includes('ลูกข่าย') || code === 'fixed') {
    return { Icon: Antenna };
  }

  // 5. Equipment Set (ชุดอุปกรณ์รวม)
  if (id === '8986d991-42ef-4c79-8d38-7790e163117e' || rawName.includes('ชุดอุปกรณ์รวม') || rawName.includes('equipment set') || rawName.includes('อุปกรณ์รวม')) {
    return { Icon: Boxes };
  }

  return {
    Icon: rawName.includes('กล่อง') || rawName.includes('อุปกรณ์') ? Package : Layers,
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
  const { t } = useTranslation();
  if (!category) return null;

  const { Icon } = resolveCategoryVisuals(category);
  const completeSets = Number(category.complete_sets) || 0;
  const isReady = completeSets > 0;
  const itemCount = category.total_items_in_bom || category.items?.length || 0;
  const bottlenecks = category.bottlenecks || [];

  return (
    <Card
      onClick={() => onSelect && onSelect(category)}
      className={`group relative overflow-hidden rounded-xl border border-border bg-card shadow-xs hover:border-border/80 transition-all duration-150 cursor-pointer flex flex-col justify-between ${className}`}
    >
      {/* Top indicator bar */}
      <div 
        className={`absolute top-0 inset-x-0 h-1 ${
          isReady ? 'bg-emerald-600' : 'bg-muted-foreground/30'
        }`} 
      />

      <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted border border-border/80 text-foreground shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            {/* Complete Sets Badge */}
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono tabular-nums font-bold border ${
              isReady 
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' 
                : 'bg-muted text-muted-foreground border-border/80'
            }`}>
              {isReady ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span>{t('siteKits.setCount', { count: completeSets })}</span>
            </div>
          </div>

          <div>
            <CardTitle className="text-xs sm:text-sm font-bold text-foreground transition-colors line-clamp-2 leading-snug">
              {category.category_name}
            </CardTitle>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
              <span>{t('siteKits.bomCount', { count: itemCount })}</span>
              {category.is_customized && (
                <span className="text-[10px] text-muted-foreground font-semibold">
                  • {t('siteKits.customized')}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-5 pb-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
        {/* Bottleneck Summary Box */}
        <div className="rounded-lg p-2.5 bg-muted/40 border border-border/50 text-[11px] space-y-1.5 min-h-[58px]">
          <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <AlertCircle className={`w-3.5 h-3.5 ${isReady ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} />
            <span>{isReady ? t('siteKits.bottleneckForNext') : t('siteKits.shortageCannotAssemble')}</span>
          </div>
          <div className="text-foreground font-medium line-clamp-2 leading-relaxed">
            {bottlenecks.length > 0 ? (
              bottlenecks.slice(0, 2).join(', ') + (bottlenecks.length > 2 ? ` (+${bottlenecks.length - 2} more)` : '')
            ) : (
              t('siteKits.allItemsReady')
            )}
          </div>
        </div>

        {/* Footer Action */}
        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground pt-1 border-t border-border/40 group-hover:text-foreground transition-colors">
          <span>{canEditBom ? t('siteKits.viewSpecsEditBom') : t('siteKits.viewSpecsStock')}</span>
          <div className="flex items-center gap-0.5 text-muted-foreground group-hover:text-foreground">
            <span>{canEditBom ? t('siteKits.manage') : t('siteKits.view')}</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(SiteKitCategoryCard);
