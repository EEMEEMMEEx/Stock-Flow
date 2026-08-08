import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

const Items = () => {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', sku: '', category_id: '', unit: 'ชิ้น', description: '', image_url: '' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      let { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      
      if (!data || data.length === 0) {
        // Auto-seed default categories into Supabase if empty
        const defaultCats = [
          { name: 'วัสดุก่อสร้าง', description: 'ปูน, หิน, ดิน, ทราย, เหล็ก' },
          { name: 'งานไฟฟ้าและแสงสว่าง', description: 'สายไฟ, สวิตช์, หลอดไฟ' },
          { name: 'งานประปาและสุขภัณฑ์', description: 'ท่อ PVC, ก๊อกน้ำ, ข้อต่อ' },
          { name: 'เครื่องมือช่างและอุปกรณ์', description: 'สว่าน, ค้อน, คีม, ตะปู' },
          { name: 'สีและเคมีภัณฑ์', description: 'สีทาบ้าน, กาว, น้ำยา' },
          { name: 'เบ็ดเตล็ด', description: 'อุปกรณ์ทั่วไป' }
        ];
        const { data: seeded } = await supabase.from('categories').insert(defaultCats).select();
        if (seeded && seeded.length > 0) data = seeded;
      }
      setCategories(data || []);
    } catch (error) {
      console.error("Fetch Categories Error:", error);
    }
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      // Fetch Master Items
      const { data: iData, error: iError } = await supabase
        .from('items')
        .select('*, categories(name)')
        .order('name');
      if (iError) throw iError;

      // Fetch Stock Balance per project-item relationship
      const { data: bData } = await supabase
        .from('stock_balance')
        .select('*');

      // Fetch Projects for code & name resolution
      const { data: pData } = await supabase
        .from('projects')
        .select('id, name, project_code');

      const projectMap = {};
      (pData || []).forEach(p => { projectMap[p.id] = p; });

      const itemMap = {};
      (iData || []).forEach(i => { itemMap[i.id] = i; });

      const itemsWithBalanceSet = new Set();
      const records = [];

      // Construct project-specific stock balance records
      (bData || []).forEach(b => {
        const item = itemMap[b.item_id] || { id: b.item_id, name: b.item_name, unit: b.unit };
        const project = projectMap[b.project_id] || {};

        itemsWithBalanceSet.add(b.item_id);

        const projectCode = project.project_code || '';
        const projectName = project.name || b.project_name || '';
        const projectDisplay = projectCode ? `${projectCode} — ${projectName}` : (projectName || '-');

        records.push({
          recordKey: `${b.item_id}_${b.project_id}`,
          id: item.id,
          project_id: b.project_id,
          name: item.name || b.item_name,
          sku: item.sku || '-',
          category_name: item.categories?.name || '-',
          category_id: item.category_id,
          project_code: projectCode,
          project_name: projectName,
          project_display: projectDisplay,
          balance: b.balance !== undefined ? b.balance : 0,
          unit: item.unit || b.unit || 'ชิ้น',
          description: item.description || '',
          image_url: item.image_url || '',
          originalItem: item
        });
      });

      // Include master items that don't have stock balance records yet (Balance: 0)
      (iData || []).forEach(item => {
        if (!itemsWithBalanceSet.has(item.id)) {
          records.push({
            recordKey: `${item.id}_none`,
            id: item.id,
            project_id: null,
            name: item.name,
            sku: item.sku || '-',
            category_name: item.categories?.name || '-',
            category_id: item.category_id,
            project_code: '',
            project_name: '-',
            project_display: '-',
            balance: 0,
            unit: item.unit || 'ชิ้น',
            description: item.description || '',
            image_url: item.image_url || '',
            originalItem: item
          });
        }
      });

      // Sort by item name then project name
      records.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      setItems(records);
    } catch (error) {
      console.error("Fetch Items Error:", error);
      toast.error('ไม่สามารถโหลดข้อมูลรายการวัสดุได้: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      return toast.error('ขนาดไฟล์รูปภาพต้องไม่เกิน 3MB');
    }

    setUploadingImage(true);
    const toastId = toast.loading('กำลังประมวลผลรูปภาพ...');
    const reader = new FileReader();

    reader.onload = () => {
      setFormData(prev => ({ ...prev, image_url: reader.result }));
      toast.success('อัปโหลดรูปภาพสำเร็จ', { id: toastId });
      setUploadingImage(false);
    };

    reader.onerror = () => {
      toast.error('ไม่สามารถอ่านไฟล์รูปภาพได้', { id: toastId });
      setUploadingImage(false);
    };

    reader.readAsDataURL(file);
  };

  const handleEditItem = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('items')
        .update({
          name: formData.name,
          sku: formData.sku,
          category_id: formData.category_id || null,
          unit: formData.unit,
          description: formData.description,
          image_url: formData.image_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
      toast.success('อัปเดตวัสดุสำเร็จ');
      setIsEditOpen(false);
      fetchItems();
    } catch (error) {
      toast.error('รหัส SKU อาจซ้ำ หรือเกิดข้อผิดพลาด');
    }
  };

  const handleDeleteItem = async () => {
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', selectedItem.id);

      if (error) throw error;
      toast.success('ลบวัสดุสำเร็จ');
      setIsDeleteOpen(false);
      fetchItems();
    } catch (error) {
      if (error.code === '23503') {
        toast.error('ไม่สามารถลบได้ เนื่องจากมีการรับเข้า/เบิกจ่ายวัสดุนี้ไปแล้ว');
      } else {
        toast.error('เกิดข้อผิดพลาดในการลบวัสดุ');
      }
    }
  };

  const openEditDialog = (item) => {
    setSelectedItem(item);
    setFormData({ 
      name: item.name, 
      sku: item.sku !== '-' ? item.sku : '', 
      category_id: item.category_id || '',
      unit: item.unit || 'ชิ้น', 
      description: item.description || '',
      image_url: item.image_url || ''
    });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (item) => {
    setSelectedItem(item);
    setIsDeleteOpen(true);
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.sku && i.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
    i.project_display.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAdmin) {
    return <div className="p-8 text-center text-red-500">Access Denied</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-8 h-8 text-indigo-500" />
            รายการวัสดุ (Items Master)
          </h2>
          <p className="text-muted-foreground mt-2">
            รายการและยอดคงเหลือวัสดุแยกตามโครงการ (แสดงยอดสต็อกตามโครงการปลายทางจริง)
          </p>
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ค้นหาชื่อ, SKU หรือโครงการ..."
              className="pl-8 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="text-xs">
              <TableHead className="w-14">รูปภาพ</TableHead>
              <TableHead>ชื่อวัสดุ</TableHead>
              <TableHead>รหัส SKU / Code</TableHead>
              <TableHead className="font-semibold text-indigo-600 dark:text-indigo-400">โครงการปลายทาง (Destination Project)</TableHead>
              <TableHead>หมวดหมู่</TableHead>
              <TableHead className="text-center font-semibold">สต็อกปัจจุบัน</TableHead>
              <TableHead className="w-[80px]">หน่วย</TableHead>
              <TableHead className="hidden md:table-cell">รายละเอียด</TableHead>
              <TableHead className="text-right w-[90px]">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs">
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  กำลังโหลดข้อมูล...
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  ไม่พบข้อมูลรายการวัสดุ
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.recordKey}>
                  <TableCell>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-9 h-9 object-cover rounded-md border shadow-sm" />
                    ) : (
                      <div className="w-9 h-9 bg-muted rounded-md flex items-center justify-center border text-muted-foreground text-[10px]">
                        ไม่มีรูป
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">{item.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{item.sku}</TableCell>
                  <TableCell>
                    <span className="font-medium text-indigo-700 dark:text-indigo-300">
                      {item.project_display}
                    </span>
                  </TableCell>
                  <TableCell>{item.category_name}</TableCell>
                  <TableCell className="text-center">
                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${item.balance > 0 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-100 text-slate-500'}`}>
                      {item.balance}
                    </span>
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{item.description || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEditDialog(item.originalItem || item)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => openDeleteDialog(item.originalItem || item)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <form onSubmit={handleEditItem}>
            <DialogHeader>
              <DialogTitle>แก้ไขรายการวัสดุ Master</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">ชื่อวัสดุ <span className="text-destructive">*</span></Label>
                <Input id="edit-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">หมวดหมู่</Label>
                <select id="edit-category" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}>
                  <option value="">-- ไม่ระบุ --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-sku">รหัส SKU (ถ้ามี)</Label>
                  <Input id="edit-sku" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unit">หน่วยนับ <span className="text-destructive">*</span></Label>
                  <Input id="edit-unit" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">รายละเอียดเพิ่มเติม</Label>
                <Input id="edit-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-image">อัปเดตรูปภาพ</Label>
                <div className="flex items-center gap-4">
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Preview" className="w-16 h-16 object-cover rounded-md border" />
                  )}
                  <Input id="edit-image" type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>ยกเลิก</Button>
              <Button type="submit">อัปเดต</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">ยืนยันการลบวัสดุ</DialogTitle>
            <DialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการลบ <strong>{selectedItem?.name}</strong>? การกระทำนี้ไม่สามารถย้อนกลับได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>ยกเลิก</Button>
            <Button type="button" variant="destructive" onClick={handleDeleteItem}>ยืนยันการลบ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Items;
