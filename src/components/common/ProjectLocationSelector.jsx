import React, { useMemo, useState, useEffect } from 'react';
import { Building2, MapPin, CheckCircle2, ChevronRight, Layers, Info } from 'lucide-react';

/**
 * ProjectLocationSelector
 * A clear, intuitive two-stage or unified Project & Storage Location selector.
 * Resolves ambiguity between Project entities and physical Storage Locations / Warehouses.
 */
export const ProjectLocationSelector = ({
  projects = [],
  value = '',
  onChange,
  required = false,
  allowAll = false,
  allLabel = '-- ทุกสถานที่จัดเก็บ (แสดงยอดรวมทั้งระบบ) --',
  mode = 'dual', // 'dual' (2 separate dropdowns) or 'unified' (single clear dropdown)
  label = 'โครงการและสถานที่จัดเก็บ (Project & Location)',
  description = 'เลือกโครงการและคลังจัดเก็บปลายทาง',
  showSummaryCard = true,
  className = '',
  size = 'default' // 'default' | 'sm' | 'lg'
}) => {
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
          name: p.name || 'โครงการทั่วไป',
          project_code: p.project_code || '',
          locations: [p]
        });
      } else {
        map.get(key).locations.push(p);
      }
    });
    return Array.from(map.values());
  }, [projects]);

  // Find the selected project location record
  const selectedRecord = useMemo(() => {
    if (!value || value === 'all') return null;
    return projects.find(p => p.id === value) || null;
  }, [projects, value]);

  // Derive the selected project group key
  const selectedGroupKey = useMemo(() => {
    if (!selectedRecord) return '';
    const nameKey = (selectedRecord.name || '').trim();
    const codeKey = (selectedRecord.project_code || '').trim();
    return `${nameKey}|||${codeKey}`;
  }, [selectedRecord]);

  // Local state for dual dropdown mode
  const [activeGroupKey, setActiveGroupKey] = useState(selectedGroupKey || (groupedProjects[0]?.key || ''));

  // Sync activeGroupKey when value changes externally
  useEffect(() => {
    if (selectedGroupKey) {
      setActiveGroupKey(selectedGroupKey);
    }
  }, [selectedGroupKey]);

  // Active project group object
  const activeGroup = useMemo(() => {
    return groupedProjects.find(g => g.key === activeGroupKey) || groupedProjects[0] || null;
  }, [groupedProjects, activeGroupKey]);

  // Handle Project Group selection (Dropdown 1)
  const handleGroupChange = (newGroupKey) => {
    if (newGroupKey === 'all') {
      setActiveGroupKey('');
      if (onChange) onChange('all', null);
      return;
    }

    setActiveGroupKey(newGroupKey);
    const targetGroup = groupedProjects.find(g => g.key === newGroupKey);
    if (!targetGroup) return;

    // Auto-select the first location of the new project group if current selection is not in this group
    const firstLoc = targetGroup.locations[0];
    if (firstLoc && onChange) {
      onChange(firstLoc.id, firstLoc);
    }
  };

  // Handle Location selection (Dropdown 2)
  const handleLocationChange = (newLocationId) => {
    const targetLoc = projects.find(p => p.id === newLocationId);
    if (onChange) {
      onChange(newLocationId, targetLoc || null);
    }
  };

  // Handle Unified selection
  const handleUnifiedChange = (newId) => {
    if (newId === 'all') {
      if (onChange) onChange('all', null);
      return;
    }
    const targetLoc = projects.find(p => p.id === newId);
    if (onChange) {
      onChange(newId, targetLoc || null);
    }
  };

  const isSmall = size === 'sm';

  // Render Dual Mode (Two-stage distinct dropdowns)
  if (mode === 'dual') {
    return (
      <div className={`space-y-3 ${className}`}>
        {/* Label & Header */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{label}</span>
            {required && <span className="text-destructive font-bold">*</span>}
          </label>
          <span className="text-[11px] text-muted-foreground font-normal">
            {groupedProjects.length} โครงการ ({projects.length} คลังจัดเก็บ)
          </span>
        </div>

        {/* 2-Column Responsive Grid for Project & Storage Location */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 1. Project Selector */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-500" />
              <span>1. เลือกโครงการ (Project)</span>
            </span>
            <select
              value={allowAll && value === 'all' ? 'all' : (activeGroupKey || '')}
              onChange={(e) => handleGroupChange(e.target.value)}
              className={`w-full rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer transition-all ${
                isSmall ? 'h-9 text-xs' : 'h-10'
              }`}
            >
              {allowAll && <option value="all">{allLabel}</option>}
              {!allowAll && !activeGroupKey && <option value="" disabled>-- กรุณาเลือกโครงการ --</option>}
              {groupedProjects.map(group => (
                <option key={group.key} value={group.key}>
                  {group.project_code ? `[${group.project_code}] ` : ''}{group.name} ({group.locations.length} คลัง)
                </option>
              ))}
            </select>
          </div>

          {/* 2. Storage Location / Warehouse Selector */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-500" />
              <span>2. เลือกคลัง / สถานที่จัดเก็บ (Storage Location)</span>
            </span>
            <select
              required={required}
              disabled={allowAll && value === 'all'}
              value={value || ''}
              onChange={(e) => handleLocationChange(e.target.value)}
              className={`w-full rounded-xl border border-input bg-background px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isSmall ? 'h-9 text-xs' : 'h-10'
              }`}
            >
              {!value && <option value="" disabled>-- เลือกสถานที่จัดเก็บ / คลัง --</option>}
              {(activeGroup?.locations || []).map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.location || 'คลังหลัก / ไม่ระบุสถานที่'} {loc.description ? `— (${loc.description})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Summary Card */}
        {showSummaryCard && selectedRecord && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-3 animate-in fade-in-50">
            <div className="space-y-0.5 min-w-0">
              <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                {selectedRecord.project_code && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-[11px] border border-emerald-500/30">
                    [{selectedRecord.project_code}]
                  </span>
                )}
                <span>โครงการ: {selectedRecord.name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 shrink-0 inline" />
                  <span>คลัง: {selectedRecord.location || 'คลังหลัก'}</span>
                </span>
              </div>
              {selectedRecord.description && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{selectedRecord.description}</span>
                </div>
              )}
            </div>

            <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono text-[10px] font-bold">
              SELECTED
            </span>
          </div>
        )}
      </div>
    );
  }

  // Render Unified Mode (Crystal-clear Single Select with explicit Project + Location label formatting)
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{label}</span>
          {required && <span className="text-destructive font-bold">*</span>}
        </label>
        <span className="text-[11px] text-muted-foreground font-normal">
          {projects.length} สถานที่จัดเก็บ
        </span>
      </div>

      <select
        required={required}
        value={value || ''}
        onChange={(e) => handleUnifiedChange(e.target.value)}
        className={`w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer transition-all ${
          isSmall ? 'h-9 text-xs' : 'h-10'
        }`}
      >
        {allowAll && <option value="all">{allLabel}</option>}
        {!allowAll && !value && <option value="" disabled>-- เลือกโครงการและคลังจัดเก็บ --</option>}
        {groupedProjects.map(group => (
          <optgroup
            key={group.key}
            label={`โครงการ: ${group.project_code ? `[${group.project_code}] ` : ''}${group.name}`}
          >
            {group.locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.location || 'คลังหลัก'} {loc.description ? `(${loc.description})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Selected Summary Card */}
      {showSummaryCard && selectedRecord && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-2">
          <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
            <span>{selectedRecord.project_code ? `[${selectedRecord.project_code}] ` : ''}{selectedRecord.name}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 inline" />
              <span>{selectedRecord.location || 'คลังหลัก'}</span>
            </span>
          </div>

          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[9px] font-bold shrink-0">
            ACTIVE
          </span>
        </div>
      )}
    </div>
  );
};

export default ProjectLocationSelector;
