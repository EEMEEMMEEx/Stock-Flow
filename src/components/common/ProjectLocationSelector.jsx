import { useMemo } from 'react';
import { Building2, ChevronRight, Info } from 'lucide-react';
import { useTranslation } from '@/i18n';

/**
 * ProjectLocationSelector
 * Clean, single-stage Project & Storage Location selector.
 * Combines Project and Location into a clear single dropdown.
 * Eliminates the confusing two-stage dropdowns ("1. เลือก โครงการ" & "2. เลือก สถานที่จัดเก็บ").
 */
export const ProjectLocationSelector = ({
  id,
  projects = [],
  value = '',
  onChange,
  required = false,
  allowAll = false,
  allLabel,
  mode: _mode = 'unified',
  label,
  icon: IconComponent,
  iconClassName,
  description: _description,
  showSummaryCard = true,
  className = '',
  disabled = false,
  showCount = true,
  size: _size = 'default'
}) => {
  const { t } = useTranslation();
  const displayLabel = label || t('projects.title');
  const displayAllLabel = allLabel || `-- ${t('common.all')} ${t('common.location')} --`;
  const Icon = IconComponent || Building2;

  // Group projects by unique Project Name + Project Code
  const groupedProjects = useMemo(() => {
    const map = new Map();
    (projects || []).forEach(p => {
      const nameKey = (p.name || '').trim();
      const codeKey = (p.project_code || '').trim();
      const key = `${nameKey}|||${codeKey}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          name: p.name || t('projects.title'),
          project_code: p.project_code || '',
          locations: [p]
        });
      } else {
        map.get(key).locations.push(p);
      }
    });
    return Array.from(map.values());
  }, [projects, t]);

  // Find the selected project location record
  const selectedRecord = useMemo(() => {
    if (!value || value === 'all') return null;
    return projects.find(p => p.id === value) || null;
  }, [projects, value]);

  // Handle selection change
  const handleChange = (newId) => {
    if (newId === 'all') {
      if (onChange) onChange('all', null);
      return;
    }
    const targetLoc = projects.find(p => p.id === newId);
    if (onChange) {
      onChange(newId, targetLoc || null);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label & Header */}
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Icon className={iconClassName || "w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"} />
          <span>{displayLabel}</span>
          {required && <span className="text-destructive font-bold">*</span>}
        </label>
        {showCount && (
          <span className="text-[11px] text-muted-foreground font-normal">
            {projects.length} {t('common.location')}
          </span>
        )}
      </div>

      {/* Single Clean Dropdown: No separate "2. สถานที่จัดเก็บ" */}
      <select
        id={id}
        required={required}
        disabled={disabled}
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium focus:ring-2 focus:ring-primary shadow-xs cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {allowAll && <option value="all">{displayAllLabel}</option>}
        {!allowAll && !value && (
          <option value="" disabled>
            -- {t('stockIn.selectProject')} & {t('common.location')} --
          </option>
        )}
        {groupedProjects.map(group => {
          if (group.locations.length === 1) {
            const loc = group.locations[0];
            const fullLabel = `${group.project_code ? `[${group.project_code}] ` : ''}${group.name}${loc.location ? ` — ${loc.location}` : ''}${loc.description ? ` (${loc.description})` : ''}`;
            return (
              <option key={loc.id} value={loc.id}>
                {fullLabel}
              </option>
            );
          }

          return (
            <optgroup
              key={group.key}
              label={`${t('common.project')}: ${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}
            >
              {group.locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.location || t('common.location')} {loc.description ? `(${loc.description})` : ''}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>

      {/* Selected Summary Card */}
      {showSummaryCard && selectedRecord && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-2 animate-in fade-in-50">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="font-semibold text-foreground truncate flex items-center gap-1.5 flex-wrap">
              {selectedRecord.project_code && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-[10px] border border-emerald-500/30">
                  [{selectedRecord.project_code}]
                </span>
              )}
              <span>{selectedRecord.name}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 inline shrink-0" />
                <span>{selectedRecord.location || t('common.location')}</span>
              </span>
            </div>
            {selectedRecord.description && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedRecord.description}</span>
              </div>
            )}
          </div>

          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[9px] font-bold shrink-0">
            {t('common.active')}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProjectLocationSelector;
