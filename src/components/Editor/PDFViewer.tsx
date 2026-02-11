
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../../store/editor-store';
import { useUIStore } from '../../store/ui-store';
import { pdfRenderer } from '../../lib/pdf-renderer';
import { useEditorTools } from '../../hooks/useEditorTools';
import { useHandTool } from '../../hooks/useHandTool';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useSelectTool } from '../../hooks/useSelectTool';
import { TextEditor } from './TextEditor';
import { NativeTextLayer } from './NativeTextLayer';

export const PDFViewer: React.FC = () => {
    const { t } = useTranslation();
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const interactionLayerRef = useRef<HTMLDivElement>(null);

    const {
        pdfDocument, pages, currentPage, scale, annotations,
        updateAnnotation, addAnnotation, activeTool,
        setNativeTextItems
    } = useEditorStore();
    const currentPageInfo = pages[currentPage - 1];
    const pageRotation = currentPageInfo?.rotation || 0;
    const currentPageId = currentPageInfo?.id;
    const { setLoading } = useUIStore();

    // 動態游標狀態
    const [isHoveringCanvas, setIsHoveringCanvas] = useState(false);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

    // 文字編輯狀態
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [currentViewport, setCurrentViewport] = useState<any>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const clickPos = useRef({ x: 0, y: 0 });
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

    // 使用編輯工具Hook
    useEditorTools(annotationCanvasRef, pdfCanvasRef, interactionLayerRef, setCursorPosition, imageInputRef, clickPos);

    // 使用手抓工具Hook
    useHandTool(containerRef);

    // 使用鍵盤快捷鍵Hook
    useKeyboardShortcuts();

    // 使用選取工具Hook(支援拖曳和雙擊編輯)
    const { selectedAnnotation } = useSelectTool(
        interactionLayerRef,
        (annotationId: string) => setEditingTextId(annotationId)
    );

    // 渲染PDF頁面
    const renderPage = useCallback(async () => {
        if (!pdfDocument || !pdfCanvasRef.current) return;

        setLoading(true);
        try {
            if (currentPageInfo?.type === 'blank') {
                // 虛擬空白頁：繪製標準 A4 比例畫布 (595x842)
                const ctx = pdfCanvasRef.current.getContext('2d');
                if (ctx) {
                    pdfCanvasRef.current.width = 595 * scale;
                    pdfCanvasRef.current.height = 842 * scale;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, pdfCanvasRef.current.width, pdfCanvasRef.current.height);
                }
            } else {
                // 1. 渲染本頁 PDF 到 Canvas，傳入當前頁的 true rotation
                const pageNum = currentPageInfo?.originalIndex || 1;
                const viewport = await pdfRenderer.renderPage(
                    pageNum,
                    pdfCanvasRef.current,
                    scale,
                    pageRotation
                );

                if (viewport) {
                    setCurrentViewport(viewport);
                }

                // 2. 提取原生文字物件，同樣傳入當前頁旋轉，確保座標對齊
                const nativeItems = await pdfRenderer.getPageTextContent(pageNum, pageRotation);
                setNativeTextItems(nativeItems);
            }

            // 確保標註 Canvas 與 PDF Canvas 尺寸完全同步
            if (annotationCanvasRef.current && pdfCanvasRef.current) {
                const width = pdfCanvasRef.current.width;
                const height = pdfCanvasRef.current.height;

                if (annotationCanvasRef.current.width !== width || annotationCanvasRef.current.height !== height) {
                    annotationCanvasRef.current.width = width;
                    annotationCanvasRef.current.height = height;
                }

                renderAnnotations();

                // --- VERIFICATION LOG START ---
                if (import.meta.env.DEV && pdfCanvasRef.current && containerRef.current) {
                    console.log('[VERIFY]',
                        'scale=', scale,
                        'rotation=', pageRotation,
                        'canvas_w=', pdfCanvasRef.current.width,
                        'canvas_h=', pdfCanvasRef.current.height
                    );
                }
                // --- VERIFICATION LOG END ---
            }
        } catch (error) {
            console.error('渲染頁面失敗:', error);
        } finally {
            setLoading(false);
        }
    }, [pdfDocument, currentPageInfo?.id, scale, pageRotation, setLoading, setNativeTextItems]);

    // 渲染標註
    const renderAnnotations = useCallback(() => {
        const canvas = annotationCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 清除Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 繪製當前頁面的所有標註
        const pageAnnotations = annotations.filter(
            (ann) => ann.pageId === currentPageInfo?.id
        );

        pageAnnotations.forEach((ann) => {
            const { data } = ann;
            switch (ann.type) {
                case 'draw':
                    // 繪製路徑
                    if (data.points && data.points.length > 1) {
                        ctx.strokeStyle = data.color || '#000000';
                        ctx.lineWidth = (data.thickness || 2) * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(data.points[0].x * scale, data.points[0].y * scale);
                        for (let i = 1; i < data.points.length; i++) {
                            ctx.lineTo(data.points[i].x * scale, data.points[i].y * scale);
                        }
                        ctx.stroke();
                    }
                    break;

                case 'eraser':
                    // 繪製橡皮擦(白色遮罩)
                    if (data.points && data.points.length > 1) {
                        ctx.strokeStyle = '#FFFFFF';
                        ctx.lineWidth = (data.size || 20) * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(data.points[0].x * scale, data.points[0].y * scale);
                        for (let i = 1; i < data.points.length; i++) {
                            ctx.lineTo(data.points[i].x * scale, data.points[i].y * scale);
                        }
                        ctx.stroke();
                    }
                    break;

                case 'shape':
                    const startX = data.x * scale;
                    const startY = data.y * scale;
                    const width = (data.width || 0) * scale;
                    const height = (data.height || 0) * scale;

                    ctx.strokeStyle = data.borderColor || '#000000';
                    ctx.lineWidth = (data.borderWidth || 2) * scale;

                    if (data.fillColor) {
                        ctx.fillStyle = data.fillColor;
                    }

                    if (data.shapeType === 'rectangle') {
                        ctx.strokeRect(startX, startY, width, height);
                        if (data.fillColor) {
                            ctx.fillRect(startX, startY, width, height);
                        }
                    } else if (data.shapeType === 'circle') {
                        const radius = Math.sqrt(width * width + height * height);
                        ctx.beginPath();
                        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                        ctx.stroke();
                        if (data.fillColor) {
                            ctx.fill();
                        }
                    } else if (data.shapeType === 'line') {
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(startX + width, startY + height);
                        ctx.stroke();
                    }
                    break;

                case 'text':
                    // 繪製文字
                    if (data.text) {
                        // 1. Redaction: Draw white background to hide original text if it's a native edit
                        // Use the NEW fontSize if available, otherwise fallback
                        const currentFontSize = data.fontSize || 16;

                        if (data.isNativeEdit) {
                            ctx.fillStyle = '#FFFFFF';
                            // const w = (data.width || 0) * scale;
                            // Check if text grew wider than original box? 
                            // Actually, for native edit, we might want to measure the new text width!
                            // But for now, let's stick to the rect. 
                            // Better yet: Measure the new text width.
                            // ctx.font needs to be set before measurement.
                            const fontStr = `${data.fontStyle || ''} ${data.fontWeight || ''} ${currentFontSize * scale}px ${data.fontFamily || 'Arial'}`;
                            ctx.font = fontStr;
                            const metrics = ctx.measureText(data.text);
                            const textWidth = metrics.width;

                            // Use the larger of original width or new text width for the white box
                            // to ensure we cover the original text, but also have background for new text if needed.
                            // Actually, we primarily need to cover the *original* text area.
                            // So we should probably keep using data.width (original PDF width) for the redaction box?
                            // No, if user types longer text, we want white background behind it too? 
                            // Usually native edit replaces implementation. 
                            // Let's use the Max width.
                            const boxWidth = Math.max((data.width || 0) * scale, textWidth);

                            const h = currentFontSize * scale;

                            // Expand slightly
                            ctx.fillRect(
                                (data.x * scale) - 4,
                                (data.y * scale) - 4,
                                boxWidth + 8,
                                h + 8
                            );
                        }

                        // 2. Draw Text
                        const fontStr = `${data.fontStyle || ''} ${data.fontWeight || ''} ${currentFontSize * scale}px ${data.fontFamily || 'Arial'}`;
                        ctx.font = fontStr.trim();
                        ctx.fillStyle = data.color || '#000000';
                        // Fix: Top baseline to match Input
                        ctx.textBaseline = 'top';
                        // Adjust y slightly if needed, but 'top' usually matches 'y'
                        ctx.fillText(
                            data.text,
                            data.x * scale,
                            data.y * scale
                        );
                    }
                    break;

                case 'image':
                    if (data.imageData) {
                        let img = imageCache.current.get(ann.id);
                        if (!img) {
                            img = new Image();
                            img.src = data.imageData;
                            img.onload = () => {
                                imageCache.current.set(ann.id, img!);
                                renderAnnotations(); // 圖片加載後重繪
                            };
                        } else {
                            ctx.drawImage(
                                img,
                                data.x * scale,
                                data.y * scale,
                                (data.width || 0) * scale,
                                (data.height || 0) * scale
                            );
                        }
                    }
                    break;

                case 'highlight':
                    // 繪製路徑型高亮
                    if (data.points && data.points.length > 1) {
                        ctx.strokeStyle = data.color || '#FFFF00';
                        ctx.lineWidth = (data.size || 20) * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.globalAlpha = data.opacity || 0.4;
                        ctx.beginPath();
                        ctx.moveTo(data.points[0].x * scale, data.points[0].y * scale);
                        for (let i = 1; i < data.points.length; i++) {
                            ctx.lineTo(data.points[i].x * scale, data.points[i].y * scale);
                        }
                        ctx.stroke();
                        ctx.globalAlpha = 1.0;
                    }
                    break;
            }
        });

        // 繪製選取框與縮放拉柄
        if (selectedAnnotation) {
            const ann = annotations.find(a => a.id === selectedAnnotation);
            if (ann && ann.pageId === currentPageInfo?.id) {
                const data = ann.data;
                let x = 0, y = 0, w = 0, h = 0;

                if (ann.type === 'draw' || ann.type === 'eraser' || ann.type === 'highlight') {
                    if (data.points && data.points.length > 0) {
                        const xs = data.points.map((p: any) => p.x);
                        const ys = data.points.map((p: any) => p.y);
                        x = Math.min(...xs);
                        y = Math.min(...ys);
                        w = Math.max(...xs) - x;
                        h = Math.max(...ys) - y;
                    }
                } else {
                    x = data.x;
                    y = data.y;
                    w = data.width || 0;
                    h = data.height || 0;

                    // 文字特殊處理寬高
                    if (ann.type === 'text') {
                        // 如果是原生編輯，data.width / height 已經是準確的 PDF 寬高
                        // 如果是新加的文字，才需要估算
                        if (data.isNativeEdit) {
                            w = data.width;
                            h = data.height;
                        } else {
                            const fontSize = data.fontSize || 16;
                            w = (data.text?.length || 0) * fontSize * 0.6; // Rough estimate
                            h = fontSize * 1.2; // Rough estimate with line height
                        }
                    }
                }

                // 繪製虛線框
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1;
                // 確保寬高不為 0，避免畫不出框
                if (w < 10) w = 10;
                if (h < 10) h = 10;

                ctx.strokeRect(x * scale - 5, y * scale - 5, w * scale + 10, h * scale + 10);
                ctx.setLineDash([]);

                // 繪製縮放拉柄 (文字暫不支援 Resize，僅圖片和形狀)
                if (ann.type === 'image' || ann.type === 'shape') {
                    ctx.fillStyle = '#3b82f6';
                    const hSize = 8;
                    const handles = [
                        { x: x * scale, y: y * scale },
                        { x: (x + w) * scale, y: y * scale },
                        { x: x * scale, y: (y + h) * scale },
                        { x: (x + w) * scale, y: (y + h) * scale },
                    ];
                    handles.forEach(h => {
                        ctx.fillRect(h.x - hSize / 2, h.y - hSize / 2, hSize, hSize);
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(h.x - hSize / 2, h.y - hSize / 2, hSize, hSize);
                    });
                }
            }
        }
    }, [annotations, currentPageId, scale, selectedAnnotation]);

    // 當 PDF 或頁面變化時重新渲染並置中
    useEffect(() => {
        if (pdfDocument || currentPageInfo?.type === 'blank') {
            renderPage();
            // 僅在文檔載入或換頁時自動置中，縮放(scale)時保持當前位置
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('centerCanvas'));
            }, 150);
        }
    }, [pdfDocument, currentPageId, renderPage, currentPageInfo]);

    // 縮放或旋轉時僅重新渲染
    useEffect(() => {
        if (pdfDocument) {
            renderPage();
        }
    }, [scale, pageRotation, renderPage, pdfDocument]);

    // 當標註變化時重新渲染標註層
    useEffect(() => {
        renderAnnotations();
    }, [annotations, renderAnnotations]);

    // 處理原生文字點擊 (原生座標已固定為 0 度座標)
    const handleNativeTextClick = useCallback((item: any) => {
        const newTextAnnotation = {
            id: `text-edit-${Date.now()}`,
            type: 'text' as const,
            pageId: currentPageInfo?.id || '',
            timestamp: Date.now(),
            data: {
                text: item.text,
                x: item.x,
                y: item.yTop, // Use yTop for UI positioning
                baselineY: item.baselineY, // Store baselineY for export
                width: item.width,
                height: item.height, // Ensure height is passed
                fontSize: item.fontSize,
                color: '#000000',
                fontFamily: 'Arial',
                isNativeEdit: true,
                originalTextId: item.id
            }
        };

        addAnnotation(newTextAnnotation);
        setEditingTextId(newTextAnnotation.id);
    }, [currentPageId, addAnnotation]);

    // 監聽新增的文字或註解標註,自動開啟編輯器
    useEffect(() => {
        if (annotations.length === 0) return;

        const lastAnnotation = annotations[annotations.length - 1];
        const now = Date.now();

        if (now - lastAnnotation.timestamp < 1000) {
            if (lastAnnotation.type === 'text' && !lastAnnotation.data.text) {
                setEditingTextId(lastAnnotation.id);
            }
        }
    }, [annotations]);

    // 監聽置中畫布事件
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleCenterCanvas = () => {
            if (!container) return;
            requestAnimationFrame(() => {
                container.scrollTo({
                    top: 0,
                    left: (container.scrollWidth - container.clientWidth) / 2,
                    behavior: 'auto'
                });
            });
        };

        window.addEventListener('centerCanvas', handleCenterCanvas);
        const timeoutId = setTimeout(handleCenterCanvas, 100);

        return () => {
            window.removeEventListener('centerCanvas', handleCenterCanvas);
            clearTimeout(timeoutId);
        };
    }, [pdfDocument]);

    if (!pdfDocument) {
        return (
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-tertiary)',
                }}
            >
                <div className="animate-pulse" style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '1.25rem', marginBottom: 'var(--spacing-md)' }}>
                        {t('app.subtitle')}
                    </p>
                    <p>{t('upload.dragDrop')}</p>
                </div>
            </div>
        );
    }

    // 計算視覺寬高 (真旋轉後寬高已經同步)
    const canvasWidth = pdfCanvasRef.current?.width || 0;
    const canvasHeight = pdfCanvasRef.current?.height || 0;
    const visualWidth = canvasWidth;
    const visualHeight = canvasHeight;

    return (
        <div
            ref={containerRef}
            className="pdf-viewer-container"
            style={{
                flex: 1,
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
                background: '#475569',
                overflow: 'auto',
                position: 'relative',
                display: 'block',
            }}
        >
            <div
                className="pdf-render-area"
                style={{
                    padding: '80px',
                    margin: '0 auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    width: 'max-content',
                    minHeight: '100%',
                    minWidth: 0,
                    position: 'relative'
                }}
            >
                {pdfDocument && (
                    <div
                        className="visual-page-wrapper"
                        style={{
                            width: visualWidth,
                            height: visualHeight,
                            position: 'relative',
                            boxShadow: 'var(--shadow-xl)',
                            background: 'white',
                        }}
                    >
                        <div
                            className="page-container"
                            style={{
                                position: 'relative',
                                width: '100%',
                                height: '100%',
                            }}
                        >
                            {/* 1. PDF 渲染層 (zIndex: 10) */}
                            <canvas
                                key={`${currentPage}-${scale}-${pageRotation}`}
                                ref={pdfCanvasRef}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    height: '100%',
                                    position: 'relative',
                                    zIndex: 10
                                }}
                            />

                            {/* 2. 標註畫布與互動層 (zIndex: 40) */}
                            <div
                                ref={interactionLayerRef}
                                className="interaction-layer"
                                onMouseDown={() => {
                                    if (import.meta.env.DEV) console.log('ANNOTATION_CLICK');
                                }}
                                onMouseEnter={() => setIsHoveringCanvas(true)}
                                onMouseLeave={() => setIsHoveringCanvas(false)}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    zIndex: 40,
                                    cursor: activeTool === 'hand' ? 'grab' : (activeTool === 'select' ? 'default' : 'crosshair'),
                                    // 確保 Select/Draw 等工具都能接收事件
                                    pointerEvents: activeTool !== 'hand' ? 'auto' : 'none'
                                }}
                            >
                                <canvas
                                    ref={annotationCanvasRef}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        zIndex: 1, // Within parent 40
                                        pointerEvents: 'none',
                                    }}
                                />
                            </div>

                            {/* 3. 原生文字偵測與編輯層 (zIndex: 60) */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                zIndex: 60,
                                // 強制設為 none，避免攔截事件
                                pointerEvents: 'none'
                            }}>
                                <NativeTextLayer
                                    scale={scale}
                                    rotation={pageRotation}
                                    viewport={currentViewport}
                                    onTextClick={handleNativeTextClick}
                                />
                            </div>

                            {/* 游標預覽器 (Cursor Preview, zIndex: 70) */}
                            {isHoveringCanvas && activeTool !== 'select' && activeTool !== 'hand' && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        width: (activeTool === 'eraser' ? 20 : 2) * scale,
                                        height: (activeTool === 'eraser' ? 20 : 2) * scale,
                                        borderRadius: '50%',
                                        border: '1px solid #3b82f6',
                                        backgroundColor: activeTool === 'eraser' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(59, 130, 246, 0.2)',
                                        pointerEvents: 'none',
                                        zIndex: 70,
                                        transform: `translate(-50%, -50%) translate(${cursorPosition.x}px, ${cursorPosition.y}px)`,
                                        boxShadow: '0 0 4px rgba(0,0,0,0.2)'
                                    }}
                                />
                            )}

                            {/* 文字編輯器 */}
                            {editingTextId && (() => {
                                const ann = annotations.find(a => a.id === editingTextId);
                                if (!ann) return null;
                                return (
                                    <TextEditor
                                        annotation={ann}
                                        scale={scale}
                                        onUpdate={(updates) => updateAnnotation(editingTextId, { ...ann.data, ...updates })}
                                        onClose={() => setEditingTextId(null)}
                                    />
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>


            {/* Debug Overlay (Fixed at top-right, high z-index) - Only in DEV */}
            {import.meta.env.DEV && (
                <div style={{
                    position: 'fixed',
                    top: '80px',
                    right: '20px',
                    zIndex: 999999,
                    background: 'rgba(0,0,0,0.85)',
                    color: '#00ff00',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    pointerEvents: 'none',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                    border: '1px solid #444',
                    minWidth: '200px'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #444', paddingBottom: '4px' }}>ENGINE MONITOR</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mouse Raw:</span> <span style={{ color: 'white' }}>{cursorPosition.x.toFixed(0)}, {cursorPosition.y.toFixed(0)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mouse PDF:</span> <span style={{ color: '#00ff00' }}>{(cursorPosition.x / scale).toFixed(0)}, {(cursorPosition.y / scale).toFixed(0)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rotation:</span> <span style={{ color: 'white' }}>{pageRotation}°</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Scale:</span> <span style={{ color: 'white' }}>{scale.toFixed(2)}x</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tool:</span> <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>{activeTool.toUpperCase()}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '4px', borderTop: '1px dotted #444' }}>
                        <span>NativeItems:</span> <span style={{ color: 'white' }}>{useEditorStore.getState().nativeTextItems.length}</span>
                    </div>
                </div>
            )}

            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
            />

        </div>
    );
};
