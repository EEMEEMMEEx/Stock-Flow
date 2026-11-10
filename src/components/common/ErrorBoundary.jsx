import { Component } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, RotateCcw, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isChunkLoadError,
  canTriggerChunkReload,
  markChunkReload,
  clearChunkReloadCooldown,
} from '@/lib/chunkErrorRecovery';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to monitoring if configured
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Stock-Flow ErrorBoundary] Caught runtime exception:', error, errorInfo);
    }

    // Auto-reload once if dynamic import / chunk failed due to deployment update
    if (isChunkLoadError(error) && canTriggerChunkReload()) {
      markChunkReload();
      window.location.reload();
    }
  }

  handleReset = () => {
    if (isChunkLoadError(this.state.error)) {
      clearChunkReloadCooldown();
      window.location.reload();
      return;
    }

    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    clearChunkReloadCooldown();
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunk = isChunkLoadError(this.state.error);
      const errorMessage = this.state.error?.message || 'An unexpected rendering error occurred.';

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-[380px] w-full flex items-center justify-center p-6 bg-background text-foreground"
        >
          <div className="max-w-lg w-full bg-card border border-border rounded-xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg shrink-0 ${isChunk ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                {isChunk ? (
                  <RefreshCw className="w-6 h-6" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-6 h-6" aria-hidden="true" />
                )}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  {isChunk ? 'ระบบมีการอัปเดตเวอร์ชันใหม่ (Application Updated)' : 'เกิดข้อผิดพลาดในการแสดงผลหน้าจอ'}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isChunk
                    ? 'ตรวจพบว่ามีการอัปเดตระบบหรือทรัพยากรหน้าเว็บมีการเปลี่ยนแปลง กรุณากดปุ่มด้านล่างเพื่อโหลดเวอร์ชันล่าสุด'
                    : 'ระบบพบข้อผิดพลาดที่ไม่คาดคิดในการประมวลผลข้อมูล กรุณากดลองใหม่อีกครั้ง หรือกลับสู่หน้าหลัก'}
                </p>
              </div>
            </div>

            {/* Error Message Snippet */}
            <div className="p-3 rounded-lg bg-muted/60 border border-border/80 text-xs font-mono text-muted-foreground overflow-x-auto max-h-32">
              <span className={`font-semibold ${isChunk ? 'text-primary' : 'text-destructive'}`}>
                {isChunk ? 'Chunk/Module Error: ' : 'Error: '}
              </span>
              {errorMessage}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {isChunk ? (
                <Button
                  variant="default"
                  onClick={this.handleReload}
                  className="flex-1 gap-2 min-h-[44px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>อัปเดตเป็นเวอร์ชันล่าสุด (Refresh Page)</span>
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={this.handleReset}
                  className="flex-1 gap-2 min-h-[44px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>ลองใหม่อีกครั้ง (Retry)</span>
                </Button>
              )}
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="flex-1 gap-2 min-h-[44px] sm:min-h-[40px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                <span>กลับหน้าหลัก (Home)</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  fallback: PropTypes.node,
  onReset: PropTypes.func,
};

export default ErrorBoundary;
