import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Trash2, User } from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

const AvatarUpload = ({ value, name = '', onChange, onRemove }) => {
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(value || '');

  useEffect(() => {
    setPreviewUrl(value || '');
  }, [value]);

  const getInitial = (str) => {
    if (!str) return 'U';
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validate File Type
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      toast.error('รองรับเฉพาะไฟล์รูปภาพ JPG และ PNG เท่านั้น');
      e.target.value = '';
      return;
    }

    // 2. Validate File Size (Max 2 MB)
    if (file.size > MAX_FILE_SIZE) {
      toast.error('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 2 MB');
      e.target.value = '';
      return;
    }

    // 3. Create Immediate Local Preview URL
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    // 4. Trigger Parent Callback
    if (onChange) {
      onChange(file, localUrl);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onRemove) onRemove();
  };

  return (
    <div className="flex items-center gap-4 p-3 rounded-xl neu-pressed-sm bg-white/40 dark:bg-black/20">
      {/* 56x56 Avatar Preview Container */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="relative w-[56px] h-[56px] min-w-[56px] min-h-[56px] rounded-full overflow-hidden neu-flat cursor-pointer group flex items-center justify-center bg-primary/10 border-2 border-primary/20 hover:border-primary transition-all shrink-0"
        title="คลิกเพื่ออัปโหลดรูปโปรไฟล์"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Avatar preview"
            className="w-full h-full object-cover"
            onError={() => setPreviewUrl('')}
          />
        ) : (
          <span className="text-xl font-bold text-primary select-none">
            {getInitial(name)}
          </span>
        )}

        {/* Hover Camera Icon Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
          <Camera className="w-5 h-5" />
        </div>
      </div>

      {/* Upload Controls & Metadata */}
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="neu-button text-xs h-8 px-3 font-medium flex items-center gap-1.5 text-primary"
          >
            <Upload className="w-3.5 h-3.5" />
            อัปโหลดรูปโปรไฟล์
          </Button>

          {previewUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-xs h-8 px-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              ลบรูป
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          รองรับไฟล์ JPG, PNG ขนาดไม่เกิน 2 MB
        </p>

        {/* Hidden Native File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default AvatarUpload;
