import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History as HistoryIcon, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

const History = () => {
  const { isAdmin, profile } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('withdrawals')
        .select('*, projects(name), items(name, unit), profiles!withdrawals_requested_by_fkey(full_name)')
        .in('status', ['completed', 'rejected', 'approved'])
        .order('updated_at', { ascending: false })
        .limit(100);
        
      if (!isAdmin) {
        query = query.eq('requested_by', profile.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = history.filter(h => 
    h.projects?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.items?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <HistoryIcon className="w-8 h-8 text-indigo-500" />
            ประวัติการเบิกจ่าย
          </h2>
          <p className="text-muted-foreground mt-2">ประวัติการขอเบิกจ่ายที่อนุมัติหรือปฏิเสธแล้ว</p>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="ค้นหาโครงการ, วัสดุ..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>วันที่อัพเดทล่าสุด</TableHead>
              <TableHead>โครงการ</TableHead>
              <TableHead>รายการ (จำนวน)</TableHead>
              <TableHead>ผู้ขอเบิก</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">กำลังโหลด...</TableCell></TableRow>
            ) : filteredHistory.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">ไม่มีข้อมูลประวัติ</TableCell></TableRow>
            ) : (
              filteredHistory.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(w.completed_at || w.approved_at || w.updated_at || w.requested_at), 'dd/MM/yy HH:mm')}
                  </TableCell>
                  <TableCell className="font-medium">{w.projects?.name}</TableCell>
                  <TableCell>
                    <div className="font-medium">{w.items?.name}</div>
                    <div className="text-sm text-muted-foreground">{w.quantity} {w.items?.unit}</div>
                  </TableCell>
                  <TableCell>{w.profiles?.full_name}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                      w.status === 'completed' ? 'text-green-500 border-green-500/20 bg-green-500/10' :
                      w.status === 'approved' ? 'text-blue-500 border-blue-500/20 bg-blue-500/10' :
                      'text-red-500 border-red-500/20 bg-red-500/10'
                    }`}>
                      {w.status.toUpperCase()}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default History;
