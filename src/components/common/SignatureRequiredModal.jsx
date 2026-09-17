import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PenTool, ArrowRight, ShieldAlert } from 'lucide-react';
import { useTranslation } from '@/i18n';

export const SignatureRequiredModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleNavigateToProfile = () => {
    if (onClose) onClose();
    navigate('/profile?tab=signature');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose && onClose()}>
      <DialogContent className="sm:max-w-[460px] rounded-xl bg-card p-6 border border-border shadow-xl">
        <DialogHeader className="space-y-3 text-center sm:text-left">
          <div className="mx-auto sm:mx-0 w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <PenTool className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-foreground">
              {t('profile.signatureRequiredModalTitle', 'จำเป็นต้องมีลายเซ็นก่อนทำรายการ')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {t(
                'profile.signatureRequiredModalDesc',
                'เพื่อความถูกต้องและความปลอดภัยของเอกสารคลังพัสดุ ระบบกำหนดให้ผู้ใช้ต้องสร้างและบันทึกลายเซ็นดิจิทัลในหน้าโปรไฟล์ก่อนทำธุรกรรม (เบิก, ยืม, หรืออนุมัติพัสดุ)'
              )}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{t('profile.signatureNoticeShort', 'กรุณาเพิ่มลายเซ็นก่อนทำรายการ')}</span>
        </div>

        <DialogFooter className="gap-2 sm:justify-end border-t border-border/40 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-lg h-9 text-xs font-semibold"
          >
            {t('common.cancel', 'ยกเลิก')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleNavigateToProfile}
            className="rounded-lg h-9 px-4 text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer"
          >
            <span>{t('profile.goToSignatureTab', 'ไปที่หน้าสร้างลายเซ็น')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SignatureRequiredModal;
