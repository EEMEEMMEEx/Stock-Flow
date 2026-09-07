import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Trash2, User } from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

/**
 * Sanitize image URL to prevent DOM XSS and meta-character injection
 * Strictly permits blob:, https:, and http: protocols and escapes meta-characters
 */
const sanitizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  // Strictly allow blob URLs created by the browser or safe http/https URLs
  if (/^blob:http(s)?:\/\/[a-zA-Z0-9._:-]+\/[a-f0-9-]+$/i.test(trimmed)) {
    return encodeURI(trimmed);
  }
  if (/^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/i.test(trimmed)) {
    return encodeURI(trimmed);
  }
  return '';
};

const AvatarUpload = ({ value, name = '', onChange, onRemove }) => {
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(() => sanitizeImageUrl(value || ''));

  useEffect(() => {
    setPreviewUrl(sanitizeImageUrl(value || ''));
  }, [value]);

  // Clean up blob URL on unmount or URL replacement to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const getInitial = (str) => {
    if (!str) return 'U';
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validate File Type
    const lowerType = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.includes(lowerType)) {
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

    // 3. Revoke previous blob URL if any
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    // 4. Create and Sanitize Immediate Local Preview URL
    const rawLocalUrl = URL.createObjectURL(file);
    const safeLocalUrl = sanitizeImageUrl(rawLocalUrl) || rawLocalUrl;
    setPreviewUrl(safeLocalUrl);

    // 5. Trigger Parent Callback
    if (onChange) {
      onChange(file, safeLocalUrl);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onRemove) onRemove();
  };

  const safePreviewSrc = sanitizeImageUrl(previewUrl);

  return (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30 border border-border/50">
      {/* 56x56 Avatar Preview Container */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="relative w-[56px] h-[56px] min-w-[56px] min-h-[56px] rounded-full overflow-hidden shadow-xs cursor-pointer group flex items-center justify-center bg-primary/10 border-2 border-primary/20 hover:border-primary transition-all shrink-0"
        title="คลิกเพื่ออัปโหลดรูปโปรไฟล์"
      >
        {safePreviewSrc ? (
          <img
            src={safePreviewSrc}
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
            className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 text-primary cursor-pointer border border-border shadow-xs hover:bg-accent"
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
