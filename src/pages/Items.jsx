import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Plus, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

const Items = () => {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', sku: '', unit: 'ชิ้น', description: '', image_url: '' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('items').select('*').order('name');
      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Fetch Items Error:", error);
      toast.error('ไม่สามารถโหลดข้อมูลรายการวัสดุได้: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const toastId = toast.loading('กำลังอัปโหลดรูปภาพ...');
      
      const formData = new FormData();
      formData.append('image', file);

      const apiUrl = import.meta.env.VITE_PDF_API_URL 
        ? `${import.meta.env.VITE_PDF_API_URL}/api/upload`
        : 'http://localhost:3001/api/upload';

      const res = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      
      setFormData(prev => ({ ...prev, image_url: data.url }));
      toast.success('อัปโหลดรูปภาพสำเร็จ', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('อัปโหลดรูปภาพล้มเหลว');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    try {
      const { data, error } = await supabase
        .from('items')
        .insert([{ 
          name: formData.name, 
          sku: formData.sku, 
          unit: formData.unit, 
          description: formData.description,
          image_url: formData.image_url 
        }]);

      if (error) throw error;
      toast.success('เพิ่มรายการวัสดุสำเร็จ');
      setIsCreateOpen(false);
      setFormData({ name: '', sku: '', unit: 'ชิ้น', description: '', image_url: '' });
      fetchItems();
    } catch (error) {
      toast.error('รหัส SKU อาจซ้ำ หรือเกิดข้อผิดพลาดอื่น');
    }
  };

  const handleEditItem = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('items')
        .update({
          name: formData.name,
          sku: formData.sku,
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
      sku: item.sku || '', 
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
    (i.sku && i.sku.toLowerCase().includes(searchQuery.toLowerCase()))
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
            จัดการฐานข้อมูลวัสดุ/อุปกรณ์กลาง
          </p>
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ค้นหาชื่อ หรือ SKU..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0 shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" /> เพิ่มวัสดุ
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateItem}>
                <DialogHeader>
                  <DialogTitle>เพิ่มรายการวัสดุใหม่</DialogTitle>
                  <DialogDescription>
                    กรอกข้อมูลพื้นฐานของวัสดุที่ต้องการลงในระบบ
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">ชื่อวัสดุ <span className="text-destructive">*</span></Label>
                    <Input id="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sku">รหัส SKU (ถ้ามี)</Label>
                      <Input id="sku" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unit">หน่วยนับ <span className="text-destructive">*</span></Label>
                      <Input id="unit" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="image">รูปภาพ</Label>
                    <Input type="file" id="image" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">รายละเอียดเพิ่มเติม</Label>
                    <Input id="description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>ยกเลิก</Button>
                  <Button type="submit">บันทึกรายการ</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-16">รูปภาพ</TableHead>
              <TableHead>ชื่อวัสดุ</TableHead>
              <TableHead>รหัส SKU</TableHead>
              <TableHead className="w-[100px]">หน่วย</TableHead>
              <TableHead className="hidden md:table-cell">รายละเอียด</TableHead>
              <TableHead className="text-right w-[100px]">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  กำลังโหลดข้อมูล...
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  ไม่พบข้อมูลรายการวัสดุ
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-10 h-10 object-cover rounded-md border shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded-md flex items-center justify-center border text-muted-foreground text-xs">
                        ไม่มีรูป
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">{item.name}</TableCell>
                  <TableCell className="font-medium text-muted-foreground">{item.sku || '-'}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{item.description || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEditDialog(item)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => openDeleteDialog(item)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
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
              <DialogTitle>แก้ไขรายการวัสดุ</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">ชื่อวัสดุ <span className="text-destructive">*</span></Label>
                <Input id="edit-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
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
