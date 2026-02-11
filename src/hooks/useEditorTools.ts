import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../store/editor-store';
import type { Annotation } from '../store/editor-store';

export const useEditorTools = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    pdfCanvasRef: React.RefObject<HTMLCanvasElement | null>,
    imageInputRef?: React.RefObject<HTMLInputElement | null>,
    clickPos?: React.MutableRefObject<{ x: number; y: number }>
) => {
    const {
        activeTool,
        activeShape,
        currentPage,
        pages,
        annotations,
        addAnnotation,
        scale,
    } = useEditorStore();

    const currentPageId = pages[currentPage - 1]?.id;

    const isDrawing = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const currentPath = useRef<{ x: number; y: number }[]>([]);
    const tempAnnotation = useRef<Annotation | null>(null);
    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

    // 取得Canvas座標
    const getCanvasCoordinates = useCallback(
        (e: MouseEvent): { x: number; y: number } => {
            const canvas = canvasRef.current;
            if (!canvas) return { x: 0, y: 0 };

            const rect = canvas.getBoundingClientRect();
            // 轉換為原始比例座標(1.0 scale)
            const x = (e.clientX - rect.left) / scale;
            const y = (e.clientY - rect.top) / scale;
            return { x, y };
        },
        [canvasRef, scale]
    );

    // 繪製臨時標註
    const drawTempAnnotation = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 先繪製所有已存在的標註
        const pageAnnotations = annotations.filter(
            (ann) => ann.pageId === currentPageId
        );

        pageAnnotations.forEach((ann) => {
            switch (ann.type) {
                case 'draw':
                    if (ann.data.points && ann.data.points.length > 1) {
                        ctx.strokeStyle = ann.data.color || '#000000';
                        ctx.lineWidth = (ann.data.thickness || 2) * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(ann.data.points[0].x * scale, ann.data.points[0].y * scale);
                        for (let i = 1; i < ann.data.points.length; i++) {
                            ctx.lineTo(ann.data.points[i].x * scale, ann.data.points[i].y * scale);
                        }
                        ctx.stroke();
                    }
                    break;

                case 'eraser':
                    if (ann.data.points && ann.data.points.length > 1) {
                        ctx.strokeStyle = '#FFFFFF';
                        ctx.lineWidth = (ann.data.size || 20) * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(ann.data.points[0].x * scale, ann.data.points[0].y * scale);
                        for (let i = 1; i < ann.data.points.length; i++) {
                            ctx.lineTo(ann.data.points[i].x * scale, ann.data.points[i].y * scale);
                        }
                        ctx.stroke();
                    }
                    break;

                case 'shape':
                    const sX = ann.data.x * scale;
                    const sY = ann.data.y * scale;
                    const w = (ann.data.width || 0) * scale;
                    const h = (ann.data.height || 0) * scale;

                    ctx.strokeStyle = ann.data.borderColor || '#000000';
                    ctx.lineWidth = (ann.data.borderWidth || 2) * scale;

                    if (ann.data.fillColor) {
                        ctx.fillStyle = ann.data.fillColor;
                    }

                    if (ann.data.shapeType === 'rectangle') {
                        ctx.strokeRect(sX, sY, w, h);
                        if (ann.data.fillColor) {
                            ctx.fillRect(sX, sY, w, h);
                        }
                    } else if (ann.data.shapeType === 'circle') {
                        const radius = Math.sqrt(w * w + h * h);
                        ctx.beginPath();
                        ctx.arc(sX, sY, radius, 0, 2 * Math.PI);
                        ctx.stroke();
                        if (ann.data.fillColor) {
                            ctx.fill();
                        }
                    } else if (ann.data.shapeType === 'line') {
                        ctx.beginPath();
                        ctx.moveTo(sX, sY);
                        ctx.lineTo(sX + w, sY + h);
                        ctx.stroke();
                    }
                    break;

                case 'text':
                    if (ann.data.text) {
                        // Copy Redaction Logic from PDFViewer
                        const currentFontSize = ann.data.fontSize || 16;
                        if (ann.data.isNativeEdit) {
                            ctx.fillStyle = '#FFFFFF';
                            const fontStr = `${ann.data.fontStyle || ''} ${ann.data.fontWeight || ''} ${currentFontSize * scale}px ${ann.data.fontFamily || 'Arial'}`;
                            ctx.font = fontStr.trim();
                            const metrics = ctx.measureText(ann.data.text);
                            const textWidth = metrics.width;
                            const boxWidth = Math.max((ann.data.width || 0) * scale, textWidth);
                            const h = currentFontSize * scale;

                            ctx.fillRect(
                                (ann.data.x * scale) - 4,
                                (ann.data.y * scale) - 4,
                                boxWidth + 8,
                                h + 8
                            );
                        }

                        ctx.textBaseline = 'top';
                        const fontStr = `${ann.data.fontStyle || ''} ${ann.data.fontWeight || ''} ${currentFontSize * scale}px ${ann.data.fontFamily || 'Arial'}`;
                        ctx.font = fontStr.trim();
                        ctx.fillStyle = ann.data.color || '#000000';
                        ctx.fillText(ann.data.text, ann.data.x * scale, ann.data.y * scale);
                    }
                    break;

                case 'image':
                    if (ann.data.imageData) {
                        let img = imageCache.current.get(ann.id);
                        if (!img) {
                            img = new Image();
                            img.src = ann.data.imageData;
                            img.onload = () => {
                                // 圖片加載後觸發重繪
                                drawTempAnnotation();
                            };
                            imageCache.current.set(ann.id, img);
                        } else if (img.complete) {
                            ctx.drawImage(img, ann.data.x * scale, ann.data.y * scale, ann.data.width * scale, ann.data.height * scale);
                        }
                    }
                    break;

                case 'highlight':
                    if (ann.data.points && ann.data.points.length > 1) {
                        ctx.strokeStyle = ann.data.color || 'rgba(255, 255, 0, 0.3)';
                        ctx.lineWidth = (ann.data.size || 20) * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.globalAlpha = 0.4;
                        ctx.beginPath();
                        ctx.moveTo(ann.data.points[0].x * scale, ann.data.points[0].y * scale);
                        for (let i = 1; i < ann.data.points.length; i++) {
                            ctx.lineTo(ann.data.points[i].x * scale, ann.data.points[i].y * scale);
                        }
                        ctx.stroke();
                        ctx.globalAlpha = 1.0;
                    }
                    break;
            }
        });

        // 再繪製臨時標註
        if (!tempAnnotation.current) return;
        const ann = tempAnnotation.current;

        switch (ann.type) {
            case 'draw':
                // 繪製路徑
                if (ann.data.points && ann.data.points.length > 1) {
                    ctx.strokeStyle = ann.data.color || '#000000';
                    ctx.lineWidth = (ann.data.thickness || 2) * scale;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(ann.data.points[0].x * scale, ann.data.points[0].y * scale);
                    for (let i = 1; i < ann.data.points.length; i++) {
                        ctx.lineTo(ann.data.points[i].x * scale, ann.data.points[i].y * scale);
                    }
                    ctx.stroke();
                }
                break;

            case 'eraser':
                // 繪製橡皮擦路徑(白色)
                if (ann.data.points && ann.data.points.length > 1) {
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = (ann.data.size || 20) * scale;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(ann.data.points[0].x * scale, ann.data.points[0].y * scale);
                    for (let i = 1; i < ann.data.points.length; i++) {
                        ctx.lineTo(ann.data.points[i].x * scale, ann.data.points[i].y * scale);
                    }
                    ctx.stroke();
                }
                break;

            case 'shape':
            case 'highlight':
                const width2 = (ann.data.width || 0) * scale;
                const height2 = (ann.data.height || 0) * scale;
                const sx = ann.data.x * scale;
                const sy = ann.data.y * scale;

                if (ann.type === 'shape') {
                    ctx.strokeStyle = ann.data.borderColor || '#000000';
                    ctx.lineWidth = (ann.data.borderWidth || 2) * scale;

                    if (ann.data.fillColor) {
                        ctx.fillStyle = ann.data.fillColor;
                    }

                    if (ann.data.shapeType === 'rectangle') {
                        ctx.strokeRect(sx, sy, width2, height2);
                        if (ann.data.fillColor) {
                            ctx.fillRect(sx, sy, width2, height2);
                        }
                    } else if (ann.data.shapeType === 'circle') {
                        const radius = Math.sqrt(width2 * width2 + height2 * height2);
                        ctx.beginPath();
                        ctx.arc(sx, sy, radius, 0, 2 * Math.PI);
                        ctx.stroke();
                        if (ann.data.fillColor) {
                            ctx.fill();
                        }
                    } else if (ann.data.shapeType === 'line') {
                        ctx.beginPath();
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(sx + width2, sy + height2);
                        ctx.stroke();
                    }
                }
                break;

                break;

            case 'image':
                // 圖片:繪製圖片
                if (ann.data.imageData) {
                    let img = imageCache.current.get(ann.id);
                    if (!img) {
                        img = new Image();
                        img.src = ann.data.imageData;
                        img.onload = () => drawTempAnnotation();
                        imageCache.current.set(ann.id, img);
                    } else if (img.complete) {
                        ctx.drawImage(img, ann.data.x * scale, ann.data.y * scale, ann.data.width * scale, ann.data.height * scale);
                    }
                }
                break;
        }
    }, [canvasRef, annotations, currentPageId, scale]);

    // 滑鼠按下
    const handleMouseDown = useCallback(
        (e: MouseEvent) => {
            const pos = getCanvasCoordinates(e);

            if (activeTool === 'image') {
                console.log('Detected Image Tool Click at:', pos);
                const input = imageInputRef?.current;
                if (input && clickPos) {
                    clickPos.current = pos;

                    // 【關鍵修正】: 即時綁定處理器，避開 useEffect 初始化失敗問題
                    input.onchange = (ev: any) => {
                        console.log('Image input: Change event detected!');
                        const file = ev.target?.files?.[0];
                        if (!file) return;

                        console.log('Image input: Reading file...', file.name);
                        const reader = new FileReader();
                        reader.onload = (readerEv) => {
                            const imageData = readerEv.target?.result as string;
                            const img = new Image();
                            img.onload = () => {
                                console.log('Image input: Adding annotation at', pos);
                                const annotation: Annotation = {
                                    id: `image-${Date.now()}`,
                                    type: 'image',
                                    pageId: currentPageId,
                                    data: {
                                        x: pos.x,
                                        y: pos.y,
                                        width: img.width / 2,
                                        height: img.height / 2,
                                        imageData,
                                    },
                                    timestamp: Date.now(),
                                };
                                addAnnotation(annotation);
                                console.log('Image input: Success');
                                // 清除 handler 並重置 input
                                input.onchange = null;
                                input.value = '';
                                // 觸發重繪
                                drawTempAnnotation();
                            };
                            img.src = imageData;
                        };
                        reader.readAsDataURL(file);
                    };

                    input.click();
                } else {
                    console.error('Image logic error: Ref is missing in click handler', { imageInputRef, clickPos });
                }
                return;
            }

            if (activeTool === 'hand') return;

            isDrawing.current = true;
            startPos.current = pos;
            currentPath.current = [pos];

            // 建立臨時標註
            const baseAnnotation = {
                id: `temp-${Date.now()}`,
                type: activeTool,
                pageId: currentPageId,
                timestamp: Date.now(),
            };

            // 從window物件讀取工具設定
            const settings = (window as any).editorToolSettings || {};

            switch (activeTool) {
                case 'draw':
                    tempAnnotation.current = {
                        ...baseAnnotation,
                        data: {
                            points: [pos],
                            color: settings.drawColor || '#000000',
                            thickness: settings.drawThickness || 2,
                        },
                    } as Annotation;
                    break;

                case 'eraser':
                    tempAnnotation.current = {
                        ...baseAnnotation,
                        data: {
                            points: [pos],
                            size: settings.eraserSize || 20,
                        },
                    } as Annotation;
                    break;

                case 'shape':
                    tempAnnotation.current = {
                        ...baseAnnotation,
                        data: {
                            shapeType: activeShape,
                            x: pos.x,
                            y: pos.y,
                            width: 0,
                            height: 0,
                            borderColor: settings.shapeBorderColor || '#000000',
                            borderWidth: 2,
                            fillColor: settings.shapeFillColor || '',
                        },
                    } as Annotation;
                    break;

                case 'text':
                    // 文字工具:點擊位置創建文字標註
                    tempAnnotation.current = {
                        ...baseAnnotation,
                        data: {
                            text: '',
                            x: pos.x,
                            y: pos.y,
                            fontSize: settings.fontSize || 16,
                            fontFamily: 'Arial',
                            color: settings.textColor || '#000000',
                        },
                    } as Annotation;
                    break;

                case 'highlight':
                    tempAnnotation.current = {
                        ...baseAnnotation,
                        data: {
                            points: [pos],
                            color: settings.highlightColor || '#FFFF00',
                            size: settings.highlightSize || 20,
                            opacity: settings.highlightOpacity || 0.3,
                        },
                    } as Annotation;
                    break;

                    break;

                case 'image' as any:
                    // 已移至 useEffect 處理
                    break;
            }
        },
        [activeTool, activeShape, currentPageId, getCanvasCoordinates]
    );

    // 滑鼠移動
    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDrawing.current || !tempAnnotation.current) return;

            const pos = getCanvasCoordinates(e);

            switch (activeTool) {
                case 'draw':
                case 'eraser':
                case 'highlight':
                    currentPath.current.push(pos);
                    tempAnnotation.current.data.points = [...currentPath.current];
                    break;

                case 'shape':
                    // 更新結束位置
                    tempAnnotation.current.data.width = pos.x - startPos.current.x;
                    tempAnnotation.current.data.height = pos.y - startPos.current.y;
                    break;
                    break;
            }

            // 重繪Canvas
            const canvas = canvasRef.current;
            const pdfCanvas = pdfCanvasRef.current;
            if (canvas && pdfCanvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // 清除並重繪
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // 繪製臨時標註
                    drawTempAnnotation();
                }
            }
        },
        [
            activeTool,
            canvasRef,
            pdfCanvasRef,
            getCanvasCoordinates,
            drawTempAnnotation,
        ]
    );

    // 滑鼠放開
    const handleMouseUp = useCallback(() => {
        if (!isDrawing.current) return;

        isDrawing.current = false;

        // 儲存標註
        if (tempAnnotation.current) {
            // 過濾掉太小的標註
            if (activeTool === 'draw' || activeTool === 'eraser' || activeTool === 'highlight') {
                if (currentPath.current.length > 2) {
                    addAnnotation(tempAnnotation.current);
                }
            } else if (activeTool === 'shape') {
                const { x: startX, y: startY } = startPos.current;
                const width = tempAnnotation.current.data.width;
                const height = tempAnnotation.current.data.height;
                const distance = Math.sqrt(width * width + height * height);
                if (distance > 5) {
                    // 設定起始位置
                    tempAnnotation.current.data.x = startX;
                    tempAnnotation.current.data.y = startY;
                    addAnnotation(tempAnnotation.current);
                }
            } else if (activeTool === 'text') {
                // 文字工具直接添加
                addAnnotation(tempAnnotation.current);
            }

            tempAnnotation.current = null;
            currentPath.current = [];
        }
    }, [activeTool, addAnnotation]);

    // 註冊事件監聽
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);

        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('mouseleave', handleMouseUp);
        };
    }, [canvasRef, handleMouseDown, handleMouseMove, handleMouseUp]);

    return {
        isDrawing: isDrawing.current,
        drawTempAnnotation
    };
};
