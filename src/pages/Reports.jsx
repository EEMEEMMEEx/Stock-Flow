import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Download } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import toast from 'react-hot-toast';

const Reports = () => {
  const [balance, setBalance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('stock_balance').select('*');
      if (error) throw error;
      setBalance(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    try {
      const exportData = balance.map(b => ({
        'โครงการ': b.project_name,
        'รายการวัสดุ': b.item_name,
        'รับเข้าทั้งหมด': b.total_in,
        'เบิกออกทั้งหมด': b.total_out,
        'คงเหลือ': b.balance,
        'หน่วย': b.unit
      }));

      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Stock Balance");
      writeFile(wb, `Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export Excel สำเร็จ');
    } catch (error) {
      toast.error('Export Excel ผิดพลาด');
    }
  };

  const handleExportPDF = async () => {
    try {
      const toastId = toast.loading('กำลังสร้างไฟล์ PDF/A-2b...');
      
      const apiUrl = import.meta.env.VITE_PDF_API_URL 
        ? `${import.meta.env.VITE_PDF_API_URL}/api/export-pdf`
        : 'http://localhost:3001/api/export-pdf';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: balance })
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Stock_Report_PDFA_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export PDF/A สำเร็จ', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('ไม่สามารถสร้าง PDF ได้ (ตรวจสอบว่าเปิด Backend แล้วหรือยัง)', { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-8 h-8 text-blue-500" />
            รายงานสรุป (Reports)
          </h2>
          <p className="text-muted-foreground mt-2">รายงานสรุปยอดคงเหลือของแต่ละโครงการ</p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleExportPDF} variant="outline" className="shadow-lg shadow-primary/10 gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
            <FileText className="w-4 h-4" /> Export PDF
          </Button>
          <Button onClick={handleExportExcel} className="shadow-lg shadow-primary/20 gap-2 bg-green-600 hover:bg-green-700 text-white">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
        </div>
      </div>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>โครงการ</TableHead>
              <TableHead>รายการวัสดุ</TableHead>
              <TableHead className="text-right">ยอดรับเข้า (In)</TableHead>
              <TableHead className="text-right">ยอดเบิกจ่าย (Out)</TableHead>
              <TableHead className="text-right">คงเหลือ (Balance)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">กำลังโหลด...</TableCell></TableRow>
            ) : balance.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">ไม่มีข้อมูลคงเหลือ</TableCell></TableRow>
            ) : (
              balance.map((b, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{b.project_name}</TableCell>
                  <TableCell>{b.item_name}</TableCell>
                  <TableCell className="text-right text-green-500">+{b.total_in}</TableCell>
                  <TableCell className="text-right text-amber-500">-{b.total_out}</TableCell>
                  <TableCell className="text-right font-bold">{b.balance} {b.unit}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default Reports;
