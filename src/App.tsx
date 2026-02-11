import { Suspense } from 'react';
import { Toolbar } from './components/Editor/Toolbar';
import { Sidebar } from './components/Editor/Sidebar';
import { PDFViewer } from './components/Editor/PDFViewer';
import { ToolSettings } from './components/Editor/ToolSettings';
import { ConversionPanel } from './components/Converter/ConversionPanel';
import { useUIStore } from './store/ui-store';
import { useEditorStore } from './store/editor-store';
import { Loader2 } from 'lucide-react';
import './lib/i18n';
import './styles/index.css';

// 載入指示器組件
const LoadingFallback = () => (
  <div style={{
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)'
  }}>
    <Loader2 size={48} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
  </div>
);

function AppContent() {
  const { loading, error, setError } = useUIStore();
  const { currentPage, totalPages } = useEditorStore();

  return (
    <div className="app" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      <ToolSettings />

      <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
        <Sidebar />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <PDFViewer />

          {/* 頁面指示器 */}
          {totalPages > 0 && (
            <div
              style={{
                padding: 'var(--spacing-sm)',
                textAlign: 'center',
                background: 'var(--bg-elevated)',
                borderTop: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
              }}
            >
              {currentPage} / {totalPages}
            </div>
          )}
        </div>
      </div>

      {/* 轉換面板 */}
      <ConversionPanel />

      {/* 載入指示器 */}
      {loading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--bg-elevated)',
              padding: 'var(--spacing-xl)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--spacing-md)',
            }}
          >
            <Loader2 size={48} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            <p style={{ color: 'var(--text-primary)' }}>處理中...</p>
          </div>
        </div>
      )}

      {/* 錯誤提示 */}
      {error && (
        <div
          style={{
            position: 'fixed',
            bottom: 'var(--spacing-lg)',
            right: 'var(--spacing-lg)',
            background: 'var(--color-error)',
            color: 'white',
            padding: 'var(--spacing-md) var(--spacing-lg)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            zIndex: 9999,
            animation: 'slideIn var(--transition-base) ease-out',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              padding: 'var(--spacing-xs)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 品牌標誌 */}
      <div
        style={{
          position: 'fixed',
          bottom: '12px',
          right: '12px',
          fontSize: '0.7rem',
          color: 'var(--text-tertiary)',
          pointerEvents: 'none',
          zIndex: 99,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)',
          letterSpacing: '0.05em',
          fontWeight: 600,
          background: 'var(--bg-elevated)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-primary)',
          opacity: 0.8,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }}></span>
        Rayz 開發製作 | v1.0.0
      </div>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AppContent />
    </Suspense>
  );
}

export default App;
