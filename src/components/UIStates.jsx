import React from 'react';
import { Loader2, AlertTriangle, RefreshCw, Package, Sparkles } from 'lucide-react';

/**
 * Premium Loading Spinner Component
 * A beautiful loading spinner with shimmer effects
 */
export const LoadingSpinner = ({ message = 'กำลังโหลด...', size = 'default' }) => {
    const sizeClasses = {
        small: 'w-8 h-8',
        default: 'w-12 h-12',
        large: 'w-16 h-16'
    };

    return (
        <div className="flex items-center justify-center py-20">
            <div className="glass-premium max-w-md mx-auto p-10 text-center scale-in">
                {/* Animated Rings */}
                <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#1C6CB4]/30 to-[#ED2229]/20 animate-pulse"></div>
                    <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#1C6CB4]/20 to-transparent animate-pulse" style={{ animationDelay: '150ms' }}></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className={`${sizeClasses[size]} border-4 border-[#1C6CB4] border-t-[#ED2229] rounded-full animate-spin`}></div>
                    </div>
                    <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-[#ED2229] animate-pulse" />
                </div>

                <h2 className="text-xl font-bold mb-2 gradient-text" style={{ color: 'var(--text-primary)' }}>กำลังโหลดข้อมูล</h2>
                <p className="text-gray-400">{message}</p>

                {/* Animated dots */}
                <div className="mt-4 flex justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#1C6CB4] animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-[#5ca0dc] animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-[#ED2229] animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
            </div>
        </div>
    );
};

/**
 * Premium Error Display Component
 * Shows error message with animated retry button
 */
export const ErrorDisplay = ({
    error,
    onRetry,
    title = 'เกิดข้อผิดพลาด',
    retryText = 'ลองใหม่'
}) => (
    <div className="min-h-[400px] flex items-center justify-center">
        <div className="glass-premium p-8 max-w-md text-center scale-in">
            <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"></div>
                <div className="relative w-full h-full bg-gradient-to-br from-red-500/30 to-red-600/20 rounded-full flex items-center justify-center">
                    <AlertTriangle className="text-red-400" size={36} />
                </div>
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            <p className="text-gray-400 mb-6">
                {error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง'}
            </p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="btn-gradient btn-glow flex items-center gap-2 mx-auto group"
                >
                    <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                    {retryText}
                </button>
            )}
        </div>
    </div>
);

/**
 * Premium Empty State Component
 * Shows when no data is found with animated icon
 */
export const EmptyState = ({
    icon = Package,
    title = 'ไม่พบข้อมูล',
    description = 'ลองค้นหาด้วยคำค้นอื่น',
    action = null
}) => {
    const IconComponent = icon;
    return (
        <div className="glass-premium p-16 flex flex-col items-center justify-center text-center scale-in">
            <div className="relative">
                {/* Floating animation container */}
                <div className="w-28 h-28 bg-gradient-to-br from-[#1C6CB4]/20 to-[#ED2229]/10 rounded-full flex items-center justify-center mb-6 shadow-lg float-animation">
                    <IconComponent className="text-gray-400" size={52} />
                </div>
                {/* Decorative sparkle */}
                <Sparkles className="absolute top-0 right-0 w-5 h-5 text-[#5ca0dc] animate-pulse" />
            </div>
            <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <p className="text-gray-400 max-w-sm">{description}</p>
            {action && (
                <div className="mt-6">
                    {action}
                </div>
            )}
        </div>
    );
};

/**
 * Premium Skeleton Loader for Cards
 * Animate placeholder content with shimmer effect
 */
export const CardSkeleton = ({ count = 3 }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: count }).map((_, i) => (
            <div
                key={i}
                className="glass-card p-6 shimmer"
                style={{ animationDelay: `${i * 100}ms` }}
            >
                <div className="h-4 bg-white/10 rounded w-1/3 mb-4"></div>
                <div className="h-6 bg-white/10 rounded w-2/3 mb-2"></div>
                <div className="h-4 bg-white/10 rounded w-1/2 mb-4"></div>
                <div className="h-10 bg-white/5 rounded-xl"></div>
            </div>
        ))}
    </div>
);

/**
 * Premium Inline Loading Indicator
 * For use inside buttons or small areas
 */
export const InlineLoader = ({ text = 'กำลังโหลด...' }) => (
    <span className="flex items-center gap-2">
        <Loader2 className="animate-spin" size={16} />
        <span className="animate-pulse">{text}</span>
    </span>
);

export default {
    LoadingSpinner,
    ErrorDisplay,
    EmptyState,
    CardSkeleton,
    InlineLoader
};
