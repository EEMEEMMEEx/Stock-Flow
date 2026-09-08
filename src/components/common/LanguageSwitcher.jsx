import { Globe } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher({ className = '', variant = 'button' }) {
  const { lang, changeLanguage, languages, t } = useTranslation();

  const toggleLanguage = () => {
    changeLanguage(lang === 'th' ? 'en' : 'th');
  };

  if (variant === 'toggle') {
    return (
      <button
        type="button"
        onClick={toggleLanguage}
        title={t('nav.switchLanguage', 'Language')}
        aria-label={t('nav.switchLanguage', 'Language')}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer',
          className
        )}
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="uppercase font-bold tracking-wider text-[11px] text-primary">
          {lang === 'th' ? 'TH' : 'EN'}
        </span>
      </button>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title={t('nav.switchLanguage', 'Language')}
          aria-label={t('nav.switchLanguage', 'Language')}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer',
            className
          )}
        >
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-bold text-[11px] tracking-wide text-foreground uppercase">
            {lang === 'th' ? 'TH' : 'EN'}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl outline-none animate-in fade-in-0 zoom-in-95"
        >
          {languages.map((l) => {
            const isSelected = l.code === lang;
            return (
              <DropdownMenu.Item
                key={l.code}
                onSelect={() => changeLanguage(l.code)}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                  isSelected && 'bg-primary/10 text-primary font-bold'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded px-1 py-0.5 bg-muted font-bold text-muted-foreground">
                    {l.flag}
                  </span>
                  <span>{l.label}</span>
                </div>
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
