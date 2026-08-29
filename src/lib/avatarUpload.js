import { uploadFileToR2 } from './r2Storage';
import { supabase } from './supabase';
import toast from 'react-hot-toast';

export const uploadAvatarImage = async (userId, file) => {
  if (!file || !userId) return null;

  try {
    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileName = `${userId}/avatar.${fileExt || 'png'}`;

    // 1. Primary: Upload directly to Cloudflare R2 (Zero Egress)
    const r2Url = await uploadFileToR2(file, 'avatars', fileName, true);
    if (r2Url) {
      return r2Url;
    }

    // 2. Fallback: Supabase Storage 'avatars' bucket if R2 was unavailable
    console.warn('[AvatarUpload] R2 upload unavailable, attempting Supabase Storage fallback...');
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    return `${urlData.publicUrl}?t=${Date.now()}`;
  } catch (error) {
    console.error('Upload Avatar Error:', error);
    toast.error('ไม่สามารถอัปโหลดรูปโปรไฟล์ได้: ' + (error.message || 'เกิดข้อผิดพลาด'));
    return null;
  }
};
