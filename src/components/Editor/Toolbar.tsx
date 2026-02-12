import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
    FolderOpen,
    Save,
    Download,
    Undo,
    Redo,
    ZoomIn,
    ZoomOut,
    MousePointer,
    Type,
    Pencil,
    Square,
    Highlighter,
    Image,
    Eraser,
    PanelLeftClose,
    PanelLeft,
    Hand,
    RotateCcw,
    RotateCw,
    X,
} from 'lucide-react';
import { useEditorStore } from '../../store/editor-store';
import type { Tool } from '../../store/editor-store';
import { useUIStore } from '../../store/ui-store';
import { pdfRenderer } from '../../lib/pdf-renderer';
import { PDFEditor } from '../../lib/pdf-editor';
import { PDFConverter } from '../../lib/pdf-converter';
import { LanguageSwitcher } from '../UI/LanguageSwitcher';
import { ThemeToggle } from '../UI/ThemeToggle';

export const Toolbar: React.FC = () => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showExportMenu, setShowExportMenu] = React.useState(false);

    const {
        pdfDocument,
        pdfFile,
        fileName,
        scale,
        activeTool,
        annotations,
        history,
        historyIndex,
        setPdfDocument,
        setScale,
        setActiveTool,
        undo,
        redo,
        rotateCurrentPage,
        pages,

    } = useEditorStore();



    const { sidebarOpen, toggleSidebar, setLoading, setError } = useUIStore();

    // 開啟檔案
    const handleOpenFile = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);

        try {
            const doc = await pdfRenderer.loadPDF(file);
            setPdfDocument(doc, file);
        } catch (error) {
            console.error('載入 PDF 失敗:', error);
            const message = error instanceof Error ? error.message : t('upload.error');
            setError(message);
        } finally {
            setLoading(false);
            // 重置 input value，這樣下次選擇檔案時（即使是同一個檔案）也會觸發 onChange
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // 儲存 PDF
    const handleSave = async () => {
        if (!pdfFile) return;

        setLoading(true);
        try {
            const pdfDoc = await PDFEditor.loadPDF(pdfFile);
            // 注意：這裡是整合原本的 applyAnnotations，可能也需要修正以支援每頁不同旋轉
            const finalDoc = await PDFEditor.applyAnnotations(pdfDoc, annotations, pages);
            await PDFEditor.downloadPDF(finalDoc, fileName.replace('.pdf', '_edited.pdf'));
        } catch (error) {
            console.error('儲存失敗:', error);
            const message = error instanceof Error ? error.message : '儲存失敗';
            setError(`儲存失敗: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    // 匯出（支援多種格式）
    const handleExport = async (format: 'pdf' | 'png' | 'jpg' = 'pdf') => {
        if (!pdfFile) return;

        setLoading(true);
        setError(null);
        setShowExportMenu(false);

        try {
            const pdfDoc = await PDFEditor.loadPDF(pdfFile);
            const finalDoc = await PDFEditor.applyAnnotations(pdfDoc, annotations, pages);

            if (format === 'pdf') {
                // 匯出為 PDF
                await PDFEditor.downloadPDF(finalDoc, fileName.replace('.pdf', '_edited.pdf'));
            } else {
                // 匯出為圖片（PNG 或 JPG）
                // 直接從編輯後的 PDFDocument 轉換為圖片
                const images = await PDFConverter.pdfDocumentToImage(finalDoc, format, 0.95);
                
                // 下載所有頁面的圖片
                const baseName = fileName.replace('.pdf', '');
                await PDFConverter.downloadImages(images, baseName, format);
            }
        } catch (error) {
            console.error('匯出失敗:', error);
            const message = error instanceof Error ? error.message : '匯出失敗';
            setError(`匯出失敗: ${message}`);
        } finally {
            setLoading(false);
        }
    };


    // 縮放
    const handleZoomIn = () => setScale(scale + 0.25);
    const handleZoomOut = () => setScale(scale - 0.25);

    // 旋轉 (改為每頁獨立)
    const rotateLeft = () => rotateCurrentPage(-90);
    const rotateRight = () => rotateCurrentPage(90);

    // 工具按鈕
    const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
        { id: 'select', icon: <MousePointer size={18} />, label: t('tools.select') },
        { id: 'hand', icon: <Hand size={18} />, label: '手抓工具' },
        { id: 'text', icon: <Type size={18} />, label: t('tools.text') },
        { id: 'draw', icon: <Pencil size={18} />, label: t('tools.draw') },
        { id: 'shape', icon: <Square size={18} />, label: t('tools.shape') },
        { id: 'highlight', icon: <Highlighter size={18} />, label: t('tools.highlight') },
        { id: 'image', icon: <Image size={18} />, label: t('tools.image') },
        { id: 'eraser', icon: <Eraser size={18} />, label: t('tools.eraser') },
    ];

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="toolbar glass-panel"
                style={{
                    position: 'sticky',
                    top: 'var(--spacing-md)',
                    left: 'var(--spacing-md)',
                    right: 'var(--spacing-md)',
                    width: 'calc(100% - var(--spacing-xl))',
                    margin: 'var(--spacing-md) auto',
                    borderRadius: 'var(--radius-xl)',
                    zIndex: 100, // 直接使用數字
                }}
            >
                {/* 檔案操作 */}
                <div className="toolbar-group">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="toolbar-button"
                        onClick={handleOpenFile}
                        title={t('toolbar.open')}
                    >
                        <FolderOpen size={20} />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="toolbar-button"
                        onClick={handleSave}
                        disabled={!pdfDocument}
                        title={t('toolbar.save')}
                    >
                        <Save size={20} />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="toolbar-button"
                        onClick={() => setShowExportMenu(true)}
                        disabled={!pdfDocument}
                        title={t('toolbar.export')}
                    >
                        <Download size={20} />
                    </motion.button>
                </div>

                {/* 編輯操作 */}
                <div className="toolbar-group">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="toolbar-button"
                        onClick={undo}
                        disabled={historyIndex <= 0}
                        title={t('toolbar.undo')}
                    >
                        <Undo size={20} />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="toolbar-button"
                        onClick={redo}
                        disabled={historyIndex >= history.length - 1}
                        title={t('toolbar.redo')}
                    >
                        <Redo size={20} />
                    </motion.button>
                </div>

                {/* 工具 */}
                <div className="toolbar-group">
                    {tools.map((tool) => (
                        <motion.button
                            key={tool.id}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`toolbar-button ${activeTool === tool.id ? 'active' : ''}`}
                            onClick={() => setActiveTool(tool.id)}
                            disabled={!pdfDocument}
                            title={tool.label}
                        >
                            {tool.icon}
                        </motion.button>
                    ))}
                </div>

                {/* 縮放 */}
                <div className="toolbar-group">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        className="toolbar-button"
                        onClick={handleZoomOut}
                        disabled={!pdfDocument || scale <= 0.25}
                        title={t('toolbar.zoomOut')}
                    >
                        <ZoomOut size={18} />
                    </motion.button>
                    <span style={{
                        padding: '0 var(--spacing-sm)',
                        color: 'var(--text-secondary)',
                        fontSize: '14px',
                        fontWeight: 500,
                        minWidth: '50px',
                        textAlign: 'center'
                    }}>
                        {Math.round(scale * 100)}%
                    </span>
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        className="toolbar-button"
                        onClick={handleZoomIn}
                        disabled={!pdfDocument || scale >= 5}
                        title={t('toolbar.zoomIn')}
                    >
                        <ZoomIn size={18} />
                    </motion.button>
                </div>

                {/* 旋轉 */}
                <div className="toolbar-group">
                    <motion.button
                        whileTap={{ rotate: -90 }}
                        className="toolbar-button"
                        onClick={rotateLeft}
                        disabled={!pdfDocument}
                        title="向左旋轉 90 度"
                    >
                        <RotateCcw size={18} />
                    </motion.button>
                    <motion.button
                        whileTap={{ rotate: 90 }}
                        className="toolbar-button"
                        onClick={rotateRight}
                        disabled={!pdfDocument}
                        title="向右旋轉 90 度"
                    >
                        <RotateCw size={18} />
                    </motion.button>
                </div>

                {/* 右側工具 */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="toolbar-button"
                        onClick={toggleSidebar}
                        title={sidebarOpen ? '隱藏側邊欄' : '顯示側邊欄'}
                    >
                        {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
                    </motion.button>
                    <ThemeToggle />
                    <LanguageSwitcher />
                </div>
            </motion.div >

            {/* 匯出格式選擇彈出視窗 */}
            <AnimatePresence>
                {showExportMenu && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowExportMenu(false)}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(0, 0, 0, 0.5)',
                                zIndex: 1040,
                            }}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={{
                                position: 'fixed',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: 'var(--bg-elevated)',
                                borderRadius: 'var(--radius-lg)',
                                boxShadow: 'var(--shadow-xl)',
                                zIndex: 1050,
                                minWidth: '280px',
                                padding: 'var(--spacing-lg)',
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 'var(--spacing-md)',
                            }}>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: '1.1rem',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                }}>
                                    選擇匯出格式
                                </h3>
                                <button
                                    onClick={() => setShowExportMenu(false)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        borderRadius: 'var(--radius-sm)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 'var(--spacing-sm)',
                            }}>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleExport('pdf')}
                                    style={{
                                        width: '100%',
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-primary)',
                                        borderRadius: 'var(--radius-md)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: 500,
                                        textAlign: 'left',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-sm)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                        e.currentTarget.style.borderColor = 'var(--border-primary)';
                                    }}
                                >
                                    <span style={{ fontWeight: 600 }}>PDF</span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        可編輯的 PDF 檔案
                                    </span>
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleExport('png')}
                                    style={{
                                        width: '100%',
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-primary)',
                                        borderRadius: 'var(--radius-md)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: 500,
                                        textAlign: 'left',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-sm)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                        e.currentTarget.style.borderColor = 'var(--border-primary)';
                                    }}
                                >
                                    <span style={{ fontWeight: 600 }}>PNG</span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        高品質圖片（透明背景）
                                    </span>
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleExport('jpg')}
                                    style={{
                                        width: '100%',
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-primary)',
                                        borderRadius: 'var(--radius-md)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: 500,
                                        textAlign: 'left',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-sm)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                        e.currentTarget.style.borderColor = 'var(--border-primary)';
                                    }}
                                >
                                    <span style={{ fontWeight: 600 }}>JPG</span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        壓縮圖片（較小檔案）
                                    </span>
                                </motion.button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
