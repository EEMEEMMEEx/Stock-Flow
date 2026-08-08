import { supabase } from './supabase';
import toast from 'react-hot-toast';

export const uploadAvatarImage = async (userId, file) => {
  if (!file || !userId) return null;

  try {
    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileName = `${userId}/avatar.${fileExt || 'png'}`;

    // 1. Upload/Upsert file to Supabase Storage 'avatars' bucket
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true, // Replace existing avatar file without orphaned files
        contentType: file.type
      });

    if (uploadError) {
      console.warn('Storage upload warning:', uploadError);
      if (uploadError.message?.includes('bucket not found') || uploadError.error === 'Bucket not found') {
        toast.error('กรุณารันสคริปต์ Migration 10 ใน Supabase SQL Editor เพื่อสร้าง Bucket "avatars"');
        return null;
      }
      throw uploadError;
    }

    // 2. Get Public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Append timestamp query parameter to bypass browser caching when updated
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    return publicUrl;
  } catch (error) {
    console.error('Upload Avatar Error:', error);
    toast.error('ไม่สามารถอัปโหลดรูปโปรไฟล์ได้: ' + (error.message || 'เกิดข้อผิดพลาด'));
    return null;
  }
};
