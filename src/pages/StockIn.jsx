import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDownToLine } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const StockIn = () => {
  const { isAdmin, profile } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // For the form
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [formData, setFormData] = useState({
    project_id: '',
    item_id: '',
    quantity: '',
    unit_price: '',
    supplier: '',
    po_number: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch entries
      const { data: entriesData, error: entriesError } = await supabase
        .from('stock_entries')
        .select('*, projects(name), items(name, unit), profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (entriesError) throw entriesError;
      setEntries(entriesData || []);

      // Fetch projects for dropdown
      const { data: projectsData } = await supabase.from('projects').select('id, name').eq('status', 'active');
      setProjects(projectsData || []);

      // Fetch items for dropdown
      const { data: itemsData } = await supabase.from('items').select('id, name, unit');
      setItems(itemsData || []);

    } catch (error) {
      toast.error('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleStockIn = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    try {
      const { error } = await supabase
        .from('stock_entries')
        .insert([{
          ...formData,
          quantity: parseInt(formData.quantity),
          unit_price: formData.unit_price ? parseFloat(formData.unit_price) : null,
          created_by: profile.id
        }]);

      if (error) throw error;
      toast.success('บันทึกรับเข้า Stock สำเร็จ');
      setFormData({ project_id: '', item_id: '', quantity: '', unit_price: '', supplier: '', po_number: '' });
      fetchData();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการรับเข้า');
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-red-500">Access Denied</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ArrowDownToLine className="w-8 h-8 text-green-500" />
          รับเข้า Stock
        </h2>
        <p className="text-muted-foreground mt-2">บันทึกรับเข้าวัสดุ/อุปกรณ์ ที่สั่งซื้อมาสำหรับแต่ละโครงการ</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Form Card */}
        <Card className="glass-card md:col-span-1">
          <CardContent className="p-6">
            <form onSubmit={handleStockIn} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">โครงการเป้าหมาย *</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required
                  value={formData.project_id}
                  onChange={e => setFormData({...formData, project_id: e.target.value})}
                >
                  <option value="" disabled>-- เลือกโครงการ --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">วัสดุ/อุปกรณ์ *</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required
                  value={formData.item_id}
                  onChange={e => setFormData({...formData, item_id: e.target.value})}
                >
                  <option value="" disabled>-- เลือกวัสดุ --</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">จำนวน *</label>
                  <Input type="number" min="1" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">ราคา/หน่วย</label>
                  <Input type="number" step="0.01" min="0" value={formData.unit_price} onChange={e => setFormData({...formData, unit_price: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Supplier</label>
                <Input value={formData.supplier} onChange={e => setFormData({...formData, supplier: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">เลข PO</label>
                <Input value={formData.po_number} onChange={e => setFormData({...formData, po_number: e.target.value})} />
              </div>

              <Button type="submit" className="w-full mt-2 bg-green-600 hover:bg-green-700">บันทึกรับเข้า</Button>
            </form>
          </CardContent>
        </Card>

        {/* List Card */}
        <Card className="glass-card md:col-span-2 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>วันที่รับเข้า</TableHead>
                <TableHead>โครงการ</TableHead>
                <TableHead>รายการ</TableHead>
                <TableHead className="text-right">จำนวน</TableHead>
                <TableHead>ผู้บันทึก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">กำลังโหลด...</TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">ไม่มีประวัติรับเข้า</TableCell></TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">{format(new Date(entry.created_at), 'dd/MM/yy HH:mm')}</TableCell>
                    <TableCell className="font-medium">{entry.projects?.name}</TableCell>
                    <TableCell>{entry.items?.name}</TableCell>
                    <TableCell className="text-right font-bold text-green-500">+{entry.quantity} {entry.items?.unit}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{entry.profiles?.full_name}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};

export default StockIn;
