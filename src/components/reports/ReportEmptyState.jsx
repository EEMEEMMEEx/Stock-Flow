import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileQuestion, RotateCcw } from 'lucide-react';

const ReportEmptyState = ({ onResetFilters }) => {
  return (
    <Card className="border border-dashed border-border/80 shadow-xs">
      <CardContent className="p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-3">
        <div className="p-4 rounded-full bg-muted/60 ring-1 ring-border text-muted-foreground">
          <FileQuestion className="w-8 h-8 stroke-1.5" />
        </div>
        <h3 className="text-lg font-bold text-foreground tracking-tight">ไม่พบข้อมูลรายงานตามเงื่อนไขที่เลือก</h3>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
          ไม่พบข้อมูลที่ตรงกับตัวกรอง โครงการ หรือช่วงวันที่ระบุ ลองปรับเปลี่ยนคำค้นหา หรือกดล้างตัวกรองเพื่อดูรายการทั้งหมด
        </p>

        {onResetFilters && (
          <Button
            onClick={onResetFilters}
            variant="outline"
            size="sm"
            className="mt-2 rounded-xl text-xs font-semibold gap-1.5 border-border hover:bg-accent cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>ล้างตัวกรองทั้งหมด</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportEmptyState;
