import { uploadFileToR2 } from './r2Storage';
import toast from 'react-hot-toast';

export const uploadAvatarImage = async (userId, file) => {
  if (!file || !userId) return null;

  try {
    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileName = `${userId}/avatar.${fileExt || 'png'}`;

    // Upload directly to Cloudflare R2 (Zero Egress Object Storage)
    const r2Url = await uploadFileToR2(file, 'avatars', fileName, false);
    return r2Url;
  } catch (error) {
    console.error('Upload Avatar Error:', error);
    toast.error('ไม่สามารถอัปโหลดรูปโปรไฟล์ได้: ' + (error.message || 'เกิดข้อผิดพลาด'));
    return null;
  }
};

