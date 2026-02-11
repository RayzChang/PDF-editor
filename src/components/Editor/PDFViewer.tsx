
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Maximize, Save } from 'lucide-react';
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

    const {
        pdfDocument, pages, currentPage, scale, rotation, annotations,
        updateAnnotation, addAnnotation, activeTool, toolSettings,
        setNativeTextItems
    } = useEditorStore();
    const currentPageId = pages[currentPage - 1]?.id;
    const currentPageInfo = pages[currentPage - 1];
    const { setLoading, setError } = useUIStore();

    // 動態游標狀態
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [isHoveringCanvas, setIsHoveringCanvas] = useState(false);

    // 文字編輯狀態
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const clickPos = useRef({ x: 0, y: 0 });
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

    // 使用編輯工具Hook
    useEditorTools(annotationCanvasRef, pdfCanvasRef, imageInputRef, clickPos);

    // 使用手抓工具Hook
    useHandTool(containerRef);

    // 使用鍵盤快捷鍵Hook
    useKeyboardShortcuts();

    // 使用選取工具Hook(支援拖曳和雙擊編輯)
    const { selectedAnnotation } = useSelectTool(
        annotationCanvasRef,
        (annotationId) => setEditingTextId(annotationId)
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
                // 1. 預先計算 Viewport 並設定 Canvas 尺寸，避免渲染前的閃爍或尺寸錯誤
                const page = await pdfDocument.getPage(currentPageInfo?.originalIndex || 1);
                const viewport = page.getViewport({ scale, rotation });

                if (pdfCanvasRef.current) {
                    pdfCanvasRef.current.width = viewport.width;
                    pdfCanvasRef.current.height = viewport.height;
                }

                // 2. 執行渲染
                await pdfRenderer.renderPage(
                    currentPageInfo?.originalIndex || 1,
                    pdfCanvasRef.current,
                    scale,
                    rotation
                );
            }

            // 3. 確保標註 Canvas 與 PDF Canvas 尺寸完全同步
            // 必須在渲染完成後執行，確保尺寸正確
            if (annotationCanvasRef.current && pdfCanvasRef.current) {
                const width = pdfCanvasRef.current.width;
                const height = pdfCanvasRef.current.height;

                // 只有當尺寸不符時才重設，避免不必要的重繪
                if (annotationCanvasRef.current.width !== width || annotationCanvasRef.current.height !== height) {
                    annotationCanvasRef.current.width = width;
                    annotationCanvasRef.current.height = height;
                }

                // 重繪標註
                renderAnnotations();

                // 提取原生文字物件
                const page = await pdfDocument.getPage(currentPageInfo?.originalIndex || 1);
                const textContent = await page.getTextContent();
                const viewport = page.getViewport({ scale: 1.0, rotation }); // 取原始比例座標

                const nativeItems = textContent.items.map((item: any, index: number) => {
                    const [a, b, , , e, f] = item.transform;
                    const fontSize = Math.sqrt(a * a + b * b);
                    // Fallback to fontSize if item.height is missing or too small
                    const height = (item.height && item.height > 0) ? item.height : fontSize;

                    return {
                        id: `native-${index}`,
                        text: item.str,
                        width: item.width,
                        height: height,
                        x: e,
                        // Ensure y is Top-Left of the box. 
                        // f is baseline from bottom.
                        // viewport.viewBox[3] - f is baseline from top.
                        // We want top of box, so subtract height (which is ascent approx).
                        y: viewport.viewBox[3] - f - height,
                        fontSize: fontSize,
                        fontFamily: item.fontName,
                        transform: item.transform
                    };
                });
                setNativeTextItems(nativeItems);

                // --- VERIFICATION LOG START ---
                if (pdfCanvasRef.current && containerRef.current) {
                    console.log('[VERIFY]',
                        'scale=', scale,
                        'canvas_attr_w=', pdfCanvasRef.current.width,
                        'canvas_css_w=', pdfCanvasRef.current.getBoundingClientRect().width,
                        'container_clientW=', containerRef.current.clientWidth,
                        'container_scrollW=', containerRef.current.scrollWidth
                    );
                }
                // --- VERIFICATION LOG END ---
            }
        } catch (error) {
            console.error('渲染頁面失敗:', error);
            // Ignore rendering errors caused by cancellation
            // setError('渲染頁面失敗'); 
        } finally {
            setLoading(false);
        }
    }, [pdfDocument, currentPageInfo, scale, rotation, setLoading, setError, setNativeTextItems]);

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
            (ann) => ann.pageId === currentPageId
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
                            const w = (data.width || 0) * scale;
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
            if (ann && ann.pageId === currentPageId) {
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
                        const fontSize = data.fontSize || 16;
                        w = (data.text?.length || 0) * fontSize * 0.6; // Rough estimate
                        h = fontSize * 1.2; // Rough estimate with line height
                    }
                }

                // 繪製虛線框
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1;
                ctx.strokeRect(x * scale - 5, y * scale - 5, w * scale + 10, h * scale + 10);
                ctx.setLineDash([]);

                // 繪製縮放拉柄 (僅圖片和形狀)
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

    // 縮放或旋轉時僅重新渲染，不觸發置中
    useEffect(() => {
        if (pdfDocument) {
            renderPage();
        }
    }, [scale, rotation, renderPage, pdfDocument]);

    // 當標註變化時重新渲染標註層
    useEffect(() => {
        renderAnnotations();
    }, [annotations, renderAnnotations]);

    // 處理原生文字點擊
    const handleNativeTextClick = useCallback((item: any) => {
        // 1. 建立一個新的文字標註來「覆蓋」原始文字
        const newTextAnnotation = {
            id: `text-edit-${Date.now()}`,
            type: 'text' as const,
            pageId: currentPageId,
            timestamp: Date.now(),
            data: {
                text: item.text,
                x: item.x,
                y: item.y,
                width: item.width,
                fontSize: item.fontSize,
                color: '#000000',
                fontFamily: 'Arial', // Fallback
                isNativeEdit: true, // 標記為原生編輯
                originalTextId: item.id
            }
        };

        // 2. 新增標註
        addAnnotation(newTextAnnotation);
        setEditingTextId(newTextAnnotation.id);
    }, [currentPageId, addAnnotation]);

    // 監聽新增的文字或註解標註,自動開啟編輯器
    useEffect(() => {
        if (annotations.length === 0) return;

        const lastAnnotation = annotations[annotations.length - 1];
        const now = Date.now();

        // 如果是剛剛新增的標註(1秒內)
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

            // 標準捲動重置：回到頂部中心
            requestAnimationFrame(() => {
                container.scrollTo({
                    top: 0,
                    left: (container.scrollWidth - container.clientWidth) / 2,
                    behavior: 'auto'
                });
            });
        };

        window.addEventListener('centerCanvas', handleCenterCanvas);

        // 渲染完成後自動執行一次
        const timeoutId = setTimeout(handleCenterCanvas, 100);

        return () => {
            window.removeEventListener('centerCanvas', handleCenterCanvas);
            clearTimeout(timeoutId);
        };
    }, [pdfDocument]); // Only re-center on document load, NOT on scale/rotation changes

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

    const getHighlightRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 0 };
    };

    const highlightColor = getHighlightRgb(toolSettings.highlightColor);

    return (
        <div
            ref={containerRef}
            className="pdf-viewer-container"
            style={{
                flex: 1, // Ensure container fills available space
                width: '100%',
                height: '100%',
                background: '#475569',
                overflow: 'auto', // Scroll bars appear here
                position: 'relative',
                display: 'block', // Changed from flex to block to allow natural overflow
            }}
        >
            <div
                className="pdf-render-area"
                style={{
                    padding: '80px',
                    margin: '0 auto', // Center horizontally if smaller than container
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    width: 'max-content', // Forces container to recognize full width
                    minHeight: '100%',
                    position: 'relative'
                }}
            >
                {pdfDocument && (
                    <div
                        className="page-container"
                        style={{
                            position: 'relative',
                            boxShadow: 'var(--shadow-xl)',
                            background: 'white',
                            // Ensure no max-width constraints
                            maxWidth: 'unset',
                        }}
                    >
                        {/* PDF 渲染層 */}
                        <canvas
                            key={`${currentPage}-${scale}-${rotation}`}
                            ref={pdfCanvasRef}
                            style={{
                                display: 'block',
                                // Ensure no fixed width/height constraints via CSS
                                maxWidth: 'unset',
                                width: 'auto',
                                height: 'auto'
                            }}
                        />

                        {/* 標註畫布層 */}
                        <canvas
                            ref={annotationCanvasRef}
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMousePos({
                                    x: e.clientX - rect.left,
                                    y: e.clientY - rect.top
                                });
                            }}
                            onMouseEnter={() => setIsHoveringCanvas(true)}
                            onMouseLeave={() => setIsHoveringCanvas(false)}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                zIndex: 10,
                                pointerEvents: activeTool === 'hand' ? 'none' : 'auto',
                                cursor: (['draw', 'eraser', 'highlight'].includes(activeTool) && isHoveringCanvas) ? 'none' : 'auto',
                            }}
                        />

                        {/* 原生文字偵測層 - Z-Index changed to 20 to be above AnnotationCanvas (10) */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            zIndex: 20,
                            // CRITICAL FIX: If activeTool is 'hand', disable ALL pointer events so drag passes through to container
                            pointerEvents: activeTool === 'hand' ? 'none' : 'none' // Container is none, children are auto (see NativeTextLayer)
                            // Actually, we can't easily control children via parent pointer-events: none unless we pass a prop.
                            // BUT, if parent is none, children can be auto.
                            // To BLOCK children, we need to hide it or pass prop.
                            // Let's pass a prop to NativeTextLayer or check activeTool inside it?
                            // NativeTextLayer checks activeTool! 
                            // Let's rely on NativeTextLayer's internal check:
                            // if (activeTool !== 'text' && activeTool !== 'select') return null;
                            // This means if 'hand' is active, NativeTextLayer returns NULL (doesn't render).
                            // So text shouldn't be blocking?
                            // Wait, let's verify NativeTextLayer logic.
                        }}>
                            <NativeTextLayer
                                scale={scale}
                                onTextClick={handleNativeTextClick}
                            />
                        </div>

                        {/* 動態尺寸游標預覽 */}
                        {isHoveringCanvas && ['draw', 'eraser', 'highlight'].includes(activeTool) && (
                            <motion.div
                                animate={{
                                    x: mousePos.x,
                                    y: mousePos.y,
                                }}
                                transition={{ type: 'spring', damping: 30, stiffness: 600, mass: 0.1 }}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    zIndex: 100,
                                    pointerEvents: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <div
                                    style={{
                                        width: (activeTool === 'draw' ? toolSettings.drawThickness :
                                            activeTool === 'eraser' ? toolSettings.eraserSize :
                                                toolSettings.highlightSize) * scale,
                                        height: (activeTool === 'draw' ? toolSettings.drawThickness :
                                            activeTool === 'eraser' ? toolSettings.eraserSize :
                                                toolSettings.highlightSize) * scale,
                                        border: '1.5px solid rgba(0, 0, 0, 0.4)',
                                        borderRadius: '50%',
                                        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.6)',
                                        background: activeTool === 'highlight' ?
                                            `rgba(${highlightColor.r}, ${highlightColor.g}, ${highlightColor.b}, 0.4)` :
                                            'transparent',
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                />
                            </motion.div>
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
                )}
            </div>

            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
            />

            <button
                onClick={() => {
                    if (containerRef.current) {
                        const scrollX = (containerRef.current.scrollWidth - containerRef.current.clientWidth) / 2;
                        containerRef.current.scrollTo({
                            top: 0,
                            left: scrollX,
                            behavior: 'smooth'
                        });
                    }
                }}
                title="回到中心"
                style={{
                    position: 'fixed',
                    bottom: '40px',
                    right: '40px',
                    width: '48px',
                    height: '48px',
                    background: 'var(--color-primary)',
                    color: 'white',
                    borderRadius: '50%',
                    boxShadow: 'var(--shadow-xl)',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
                <Maximize size={24} />
            </button>

            <button
                onClick={async () => {
                    if (!pdfDocument || !pages[0]) return;

                    try {
                        setLoading(true);
                        const { pdfFile } = useEditorStore.getState();
                        if (!pdfFile) return;

                        let currentBytes: Uint8Array | ArrayBuffer = await pdfFile.arrayBuffer();
                        const nativeEdits = annotations.filter(a => a.type === 'text' && a.data.isNativeEdit);

                        if (nativeEdits.length > 0) {
                            const editsByPage = new Map<number, any[]>();
                            for (const edit of nativeEdits) {
                                const pageInfo = pages.find(p => p.id === edit.pageId);
                                if (!pageInfo || pageInfo.type !== 'original' || pageInfo.originalIndex === undefined) continue;
                                const pageIndex = pageInfo.originalIndex - 1;
                                if (!editsByPage.has(pageIndex)) editsByPage.set(pageIndex, []);
                                editsByPage.get(pageIndex)?.push({
                                    text: edit.data.text,
                                    originalText: '',
                                    x: edit.data.x,
                                    y: edit.data.y,
                                    width: edit.data.width,
                                    height: edit.data.fontSize,
                                    fontSize: edit.data.fontSize,
                                    fontFamily: edit.data.fontFamily,
                                    color: edit.data.color
                                });
                            }
                            const { modifyPageText } = await import('../../lib/pdf-editor');
                            for (const [pageIndex, mods] of editsByPage.entries()) {
                                currentBytes = await modifyPageText(currentBytes, pageIndex, mods);
                            }
                        }

                        const blob = new Blob([currentBytes as any], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `edited_${Date.now()}.pdf`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    } catch (e: any) {
                        console.error('Save failed:', e);
                        setError(e.message || '儲存失敗');
                    } finally {
                        setLoading(false);
                    }
                }}
                title="儲存並下載"
                style={{
                    position: 'fixed',
                    bottom: '40px',
                    right: '100px',
                    width: '48px',
                    height: '48px',
                    background: '#10b981',
                    color: 'white',
                    borderRadius: '50%',
                    boxShadow: 'var(--shadow-xl)',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
                <Save size={24} />
            </button>
        </div>
    );
};
