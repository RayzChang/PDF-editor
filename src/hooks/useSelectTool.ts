import { useEffect, useCallback, useState, useRef } from 'react';
import { useEditorStore } from '../store/editor-store';
import type { Annotation } from '../store/editor-store';

export const useSelectTool = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    onTextClick: (annotationId: string) => void
) => {
    const { activeTool, annotations, currentPage, pages, updateAnnotation, scale } = useEditorStore();
    const currentPageId = pages[currentPage - 1]?.id;
    const [isDragging, setIsDragging] = useState(false);
    const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
    const [activeHandle, setActiveHandle] = useState<string | null>(null); // 'nw', 'ne', 'sw', 'se'
    const dragStart = useRef({ x: 0, y: 0 });
    const annotationStart = useRef<{ x: number; y: number; width: number; height: number; points?: { x: number; y: number }[] }>({ x: 0, y: 0, width: 0, height: 0 });

    const findAnnotationAtPoint = useCallback(
        (x: number, y: number): Annotation | null => {
            const pageAnnotations = annotations.filter((ann) => ann.pageId === currentPageId);

            // 從後往前查找(最新的在最上面)
            for (let i = pageAnnotations.length - 1; i >= 0; i--) {
                const ann = pageAnnotations[i];
                const data = ann.data;

                switch (ann.type) {
                    case 'text':
                        // 文字: 檢查點擊區域
                        const fontSize = data.fontSize || 16;
                        const textWidth = (data.text?.length || 0) * fontSize * 0.6;
                        const textHeight = fontSize;

                        const padding = 10; // 增加點擊緩衝

                        if (
                            x >= data.x - padding &&
                            x <= data.x + textWidth + padding &&
                            y >= data.y - padding &&
                            y <= data.y + textHeight + padding
                        ) {
                            return ann;
                        }
                        break;

                    case 'draw':
                    case 'eraser':
                    case 'highlight':
                        // 檢查路徑附近
                        if (data.points) {
                            const threshold = (data.thickness || data.size || 10) / 2 + 5;
                            for (const point of data.points) {
                                const distance = Math.sqrt(
                                    Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2)
                                );
                                if (distance < threshold) {
                                    return ann;
                                }
                            }
                        }
                        break;

                    case 'image':
                        // 圖片: 檢查矩形區域
                        const p = 5; // 圖片緩衝
                        if (
                            x >= data.x - p &&
                            x <= data.x + data.width + p &&
                            y >= data.y - p &&
                            y <= data.y + data.height + p
                        ) {
                            return ann;
                        }
                        break;

                    case 'shape':
                        // 形狀:檢查矩形區域
                        const width = data.width || 0;
                        const height = data.height || 0;
                        // 考慮到負數寬高(拖曳方向)
                        const left = width > 0 ? data.x : data.x + width;
                        const top = height > 0 ? data.y : data.y + height;
                        const absWidth = Math.abs(width);
                        const absHeight = Math.abs(height);

                        if (
                            x >= left &&
                            x <= left + absWidth &&
                            y >= top &&
                            y <= top + absHeight
                        ) {
                            return ann;
                        }
                        break;
                }
            }
            return null;
        },
        [annotations, currentPageId]
    );

    const handleMouseDown = useCallback(
        (e: MouseEvent) => {
            if (activeTool !== 'select') return;

            const canvas = canvasRef.current;
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / scale;
            const y = (e.clientY - rect.top) / scale;

            // 1. 先檢査是否點擊了已選中標註的縮放控制點
            if (selectedAnnotation) {
                const ann = annotations.find(a => a.id === selectedAnnotation);
                if (ann && (ann.type === 'image' || ann.type === 'shape')) {
                    const data = ann.data;
                    const hSize = 8 / scale;
                    const handles = [
                        { id: 'nw', x: data.x, y: data.y },
                        { id: 'ne', x: data.x + data.width, y: data.y },
                        { id: 'sw', x: data.x, y: data.y + data.height },
                        { id: 'se', x: data.x + data.width, y: data.y + data.height },
                    ];

                    for (const h of handles) {
                        if (x >= h.x - hSize && x <= h.x + hSize && y >= h.y - hSize && y <= h.y + hSize) {
                            setActiveHandle(h.id);
                            setIsDragging(true);
                            dragStart.current = { x, y };
                            annotationStart.current = { x: data.x, y: data.y, width: data.width, height: data.height };
                            return;
                        }
                    }
                }
            }

            // 2. 檢査是否點擊了標註主體
            const annotation = findAnnotationAtPoint(x, y);
            if (annotation) {
                if (e.detail === 2) {
                    if (annotation.type === 'text') {
                        onTextClick(annotation.id);
                    }
                    return;
                }

                setSelectedAnnotation(annotation.id);
                setActiveHandle(null);
                setIsDragging(true);
                dragStart.current = { x, y };
                annotationStart.current = {
                    x: annotation.data.x || 0,
                    y: annotation.data.y || 0,
                    width: annotation.data.width || 0,
                    height: annotation.data.height || 0,
                    points: annotation.data.points ? JSON.parse(JSON.stringify(annotation.data.points)) : undefined
                };
                e.preventDefault();
            } else {
                setSelectedAnnotation(null);
                setActiveHandle(null);
            }
        },
        [activeTool, canvasRef, scale, findAnnotationAtPoint, onTextClick]
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDragging || !selectedAnnotation || activeTool !== 'select') return;

            const canvas = canvasRef.current;
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / scale;
            const y = (e.clientY - rect.top) / scale;

            const dx = x - dragStart.current.x;
            const dy = y - dragStart.current.y;

            const annotation = annotations.find((a) => a.id === selectedAnnotation);
            if (!annotation) return;

            const newData = { ...annotation.data };

            if (activeHandle) {
                // 縮放邏輯
                const start = annotationStart.current;
                switch (activeHandle) {
                    case 'nw':
                        newData.x = start.x + dx;
                        newData.y = start.y + dy;
                        newData.width = start.width - dx;
                        newData.height = start.height - dy;
                        break;
                    case 'ne':
                        newData.y = start.y + dy;
                        newData.width = start.width + dx;
                        newData.height = start.height - dy;
                        break;
                    case 'sw':
                        newData.x = start.x + dx;
                        newData.width = start.width - dx;
                        newData.height = start.height + dy;
                        break;
                    case 'se':
                        newData.width = start.width + dx;
                        newData.height = start.height + dy;
                        break;
                }
            } else {
                // 一般移動邏輯
                switch (annotation.type) {
                    case 'text':
                    case 'image':
                    case 'shape':
                        newData.x = annotationStart.current.x + dx;
                        newData.y = annotationStart.current.y + dy;
                        break;

                    case 'draw':
                    case 'eraser':
                    case 'highlight':
                        if (annotationStart.current.points) {
                            newData.points = annotationStart.current.points.map((p: any) => ({
                                x: p.x + dx,
                                y: p.y + dy,
                            }));
                        }
                        break;
                }
            }

            updateAnnotation(selectedAnnotation, newData);
        },
        [isDragging, selectedAnnotation, activeTool, canvasRef, scale, annotations, updateAnnotation]
    );

    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            setActiveHandle(null);

            if (selectedAnnotation) {
                const annotation = annotations.find((a) => a.id === selectedAnnotation);
                if (annotation) {
                    annotationStart.current = {
                        x: annotation.data.x || 0,
                        y: annotation.data.y || 0,
                        width: annotation.data.width || 0,
                        height: annotation.data.height || 0,
                        points: annotation.data.points ? JSON.parse(JSON.stringify(annotation.data.points)) : undefined
                    };
                }
            }
        }
    }, [isDragging, selectedAnnotation, annotations]);

    // 註冊事件
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.addEventListener('mousedown', handleMouseDown as any);
        window.addEventListener('mousemove', handleMouseMove as any);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown as any);
            window.removeEventListener('mousemove', handleMouseMove as any);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [canvasRef, handleMouseDown, handleMouseMove, handleMouseUp]);

    return { selectedAnnotation };
};
