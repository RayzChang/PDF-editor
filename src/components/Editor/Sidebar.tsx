import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../../store/editor-store';
import { useUIStore } from '../../store/ui-store';
import { pdfRenderer } from '../../lib/pdf-renderer';
import { Trash2, FilePlus } from 'lucide-react';

export const Sidebar: React.FC = () => {
    const { t } = useTranslation();
    const { pdfDocument, pages, currentPage, totalPages, setCurrentPage, addBlankPage, removePage, movePage } = useEditorStore();
    const { sidebarOpen } = useUIStore();
    const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({});
    const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);

    // 生成縮圖
    useEffect(() => {
        let isCancelled = false;

        const generateThumbnails = async () => {
            if (!pdfDocument || pages.length === 0) {
                setThumbnails({});
                return;
            }

            console.log('Generating thumbnails for pages:', pages.length);

            for (const page of pages) {
                if (isCancelled) break;

                // 快取鍵包含旋轉角度，確保旋轉時會更新縮圖
                const thumbKey = `${page.id}-${page.rotation}`;
                if (thumbnails[thumbKey]) continue;

                if (page.type === 'blank') {
                    setThumbnails(prev => ({ ...prev, [thumbKey]: 'BLANK' }));
                    continue;
                }

                try {
                    const canvas = document.createElement('canvas');
                    await pdfRenderer.renderThumbnail(
                        page.originalIndex!,
                        canvas,
                        150,
                        page.rotation
                    );
                    const dataUrl = canvas.toDataURL();

                    if (!isCancelled) {
                        setThumbnails(prev => ({ ...prev, [thumbKey]: dataUrl }));
                    }
                } catch (err) {
                    console.error(`Failed to render thumbnail for page ${page.id}:`, err);
                }
            }
        };

        generateThumbnails();

        return () => {
            isCancelled = true;
        };
    }, [pdfDocument, pages]); // 當頁面結構或旋轉變動時檢查

    if (!sidebarOpen) return null;

    return (
        <div className="sidebar" style={{ minWidth: '240px' }}>
            <div
                style={{
                    padding: 'var(--spacing-lg) var(--spacing-md)',
                    borderBottom: '1px solid var(--border-primary)',
                    background: 'var(--bg-primary)',
                    zIndex: 10,
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--spacing-xs)'
                }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        {t('pages.pages')}
                    </span>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            addBlankPage();
                        }}
                        title={t('pages.add')}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--color-primary)',
                            color: 'white',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-xs)',
                            boxShadow: 'var(--shadow-md)',
                        }}
                    >
                        <FilePlus size={14} />
                        {t('pages.add')}
                    </motion.button>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                    {totalPages} {t('pages.pages')}
                </div>
            </div>

            <div
                style={{
                    padding: 'var(--spacing-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-sm)',
                }}
            >
                <AnimatePresence initial={false}>
                    {pages.map((page, index) => {
                        const pageNum = index + 1;
                        const isActive = pageNum === currentPage;
                        const thumb = thumbnails[`${page.id}-${page.rotation}`];

                        return (
                            <motion.div
                                key={page.id}
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                className="sidebar-page-item-container"
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    opacity: draggedIndex === index ? 0.3 : 1,
                                    cursor: 'grab',
                                }}
                                draggable
                                onDragStart={(e: any) => {
                                    setDraggedIndex(index);
                                    e.dataTransfer.setData('text/plain', index.toString());
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e: any) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e: any) => {
                                    e.preventDefault();
                                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                    if (!isNaN(fromIndex) && fromIndex !== index) {
                                        movePage(fromIndex, index);
                                    }
                                    setDraggedIndex(null);
                                }}
                                onDragEnd={() => setDraggedIndex(null)}
                            >
                                <button
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`sidebar-page-item ${isActive ? 'active' : ''}`}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-xs)',
                                        padding: 'var(--spacing-sm)',
                                        background: 'white',
                                        cursor: 'pointer',
                                        width: '100%',
                                        minHeight: '160px',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {thumb === 'BLANK' ? (
                                        <div style={{
                                            width: '100%',
                                            height: '140px',
                                            background: '#fff',
                                            border: '1px solid var(--border-primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'var(--text-tertiary)',
                                            borderRadius: 'var(--radius-sm)'
                                        }}>
                                            <span style={{ fontSize: '0.75rem' }}>{t('pages.blank')}</span>
                                        </div>
                                    ) : thumb ? (
                                        <img
                                            src={thumb}
                                            alt={`Page ${pageNum}`}
                                            style={{
                                                width: '100%',
                                                height: 'auto',
                                                maxHeight: '140px',
                                                objectFit: 'contain',
                                                borderRadius: 'var(--radius-sm)',
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: '100%',
                                            height: '120px',
                                            background: 'var(--bg-tertiary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'var(--text-tertiary)',
                                            borderRadius: 'var(--radius-sm)'
                                        }}>
                                            <span className="animate-pulse">{t('common.loading')}...</span>
                                        </div>
                                    )}
                                    <span
                                        style={{
                                            fontSize: '0.8rem',
                                            color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                                            fontWeight: isActive ? 700 : 500,
                                            marginTop: 'var(--spacing-xs)'
                                        }}
                                    >
                                        {t('pages.page', { number: pageNum })}
                                    </span>
                                </button>

                                {/* 刪除按鈕 */}
                                {pages.length > 1 && (
                                    <motion.button
                                        whileHover={{ scale: 1.1, background: 'var(--color-error)' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`${t('common.confirm')} ${t('pages.delete')} ${t('pages.page', { number: pageNum })}?`)) {
                                                removePage(page.id);
                                            }
                                        }}
                                        title={t('pages.delete')}
                                        style={{
                                            position: 'absolute',
                                            top: '12px',
                                            right: '12px',
                                            width: '28px',
                                            height: '28px',
                                            background: 'rgba(239, 68, 68, 0.95)',
                                            color: 'white',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            zIndex: 5,
                                            boxShadow: 'var(--shadow-md)',
                                        }}
                                        className="delete-page-btn"
                                    >
                                        <Trash2 size={14} />
                                    </motion.button>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
};
