import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowUpFromLine, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const Withdrawals = () => {
  const { isAdmin, profile } = useAuth();
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Create form
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [formData, setFormData] = useState({ project_id: '', item_id: '', quantity: '', purpose: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch withdrawals based on role
      let query = supabase
        .from('withdrawals')
        .select('*, projects(name), items(name, unit), profiles!withdrawals_requested_by_fkey(full_name)')
        .order('requested_at', { ascending: false });
        
      if (!isAdmin) {
        query = query.eq('requested_by', profile.id);
      }
      
      const { data: wData, error: wError } = await query;
      if (wError) throw wError;
      setWithdrawals(wData || []);

      // Fetch projects and items for form
      const { data: pData } = await supabase.from('projects').select('id, name').eq('status', 'active');
      const { data: iData } = await supabase.from('items').select('id, name, unit');
      setProjects(pData || []);
      setItems(iData || []);
    } catch (error) {
      toast.error('ไม่สามารถโหลดข้อมูลการเบิกจ่ายได้');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('withdrawals').insert([{
        ...formData,
        quantity: parseInt(formData.quantity),
        requested_by: profile.id
      }]);
      if (error) throw error;
      toast.success('สร้างคำขอเบิกจ่ายสำเร็จ');
      setIsDialogOpen(false);
      setFormData({ project_id: '', item_id: '', quantity: '', purpose: '' });
      fetchData();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleStatusChange = async (id, status) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('withdrawals')
        .update({ 
          status, 
          approved_by: profile.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      toast.success(`เปลี่ยนสถานะเป็น ${status} สำเร็จ`);
      fetchData();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการอัพเดทสถานะ');
    }
  };

  const StatusBadge = ({ status }) => {
    switch(status) {
      case 'pending': return <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-amber-500/20"><Clock className="w-3 h-3"/> รออนุมัติ</span>;
      case 'approved': return <span className="flex items-center gap-1 text-blue-500 bg-blue-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-500/20"><CheckCircle2 className="w-3 h-3"/> อนุมัติแล้ว</span>;
      case 'completed': return <span className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-green-500/20"><CheckCircle2 className="w-3 h-3"/> รับของแล้ว</span>;
      case 'rejected': return <span className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full text-xs font-medium border border-red-500/20"><XCircle className="w-3 h-3"/> ไม่อนุมัติ</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ArrowUpFromLine className="w-8 h-8 text-amber-500" />
            เบิกจ่าย (Withdrawals)
          </h2>
          <p className="text-muted-foreground mt-2">
            {isAdmin ? 'จัดการคำขอเบิกจ่ายวัสดุสำหรับโครงการ' : 'ประวัติคำขอเบิกจ่ายของคุณ'}
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-lg shadow-primary/20">สร้างคำขอเบิกจ่าย</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleRequest}>
              <DialogHeader>
                <DialogTitle>สร้างคำขอเบิกจ่ายใหม่</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">นำไปใช้โครงการ *</label>
                  <select required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.project_id} onChange={e => setFormData({...formData, project_id: e.target.value})}>
                    <option value="" disabled>-- เลือกโครงการ --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">วัสดุ/อุปกรณ์ *</label>
                  <select required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.item_id} onChange={e => setFormData({...formData, item_id: e.target.value})}>
                    <option value="" disabled>-- เลือกวัสดุ --</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">จำนวน *</label>
                  <Input type="number" min="1" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">วัตถุประสงค์การเบิก</label>
                  <Input required value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>ยกเลิก</Button>
                <Button type="submit">ส่งคำขอ</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>วันที่ขอเบิก</TableHead>
              <TableHead>โครงการ</TableHead>
              <TableHead>ผู้ขอเบิก</TableHead>
              <TableHead>รายการ (จำนวน)</TableHead>
              <TableHead>สถานะ</TableHead>
              {isAdmin && <TableHead className="text-right">จัดการ (Admin)</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">กำลังโหลด...</TableCell></TableRow>
            ) : withdrawals.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">ไม่มีข้อมูลคำขอเบิกจ่าย</TableCell></TableRow>
            ) : (
              withdrawals.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="text-muted-foreground">{format(new Date(w.requested_at), 'dd/MM/yy HH:mm')}</TableCell>
                  <TableCell className="font-medium">{w.projects?.name}</TableCell>
                  <TableCell>{w.profiles?.full_name}</TableCell>
                  <TableCell>
                    <div className="font-medium text-amber-500">{w.items?.name}</div>
                    <div className="text-sm text-muted-foreground">{w.quantity} {w.items?.unit}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={w.status} /></TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {w.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="text-green-500 border-green-500/50 hover:bg-green-500/10" onClick={() => handleStatusChange(w.id, 'approved')}>อนุมัติ</Button>
                          <Button size="sm" variant="outline" className="text-red-500 border-red-500/50 hover:bg-red-500/10" onClick={() => handleStatusChange(w.id, 'rejected')}>ปฏิเสธ</Button>
                        </div>
                      )}
                      {w.status === 'approved' && (
                        <Button size="sm" variant="outline" className="text-blue-500 border-blue-500/50 hover:bg-blue-500/10" onClick={() => handleStatusChange(w.id, 'completed')}>รับของแล้ว</Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default Withdrawals;
