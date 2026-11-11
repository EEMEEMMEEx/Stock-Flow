import { uploadFileWithKey } from './r2Storage.js';
import toast from 'react-hot-toast';

export const uploadAvatarImage = async (userId, file) => {
  if (!file || !userId) return null;

  try {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `avatar_${safeUserId}_${Date.now()}.${fileExt}`;

    // Upload directly to Object Storage and return object key
    const result = await uploadFileWithKey(file, 'avatars', fileName, false);
    return result?.key || result?.publicUrl || null;
  } catch (error) {
    console.error('Upload Avatar Error:', error);
    toast.error('Failed to upload avatar image: ' + (error.message || 'An error occurred'));
    return null;
  }
};

