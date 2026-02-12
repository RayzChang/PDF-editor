import { useEffect } from 'react';
import { useEditorStore, type TextAnnotationData } from '../store/editor-store';

export const useTextAnnotationClick = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    onTextClick: (annotationId: string) => void
) => {
    const { annotations, currentPage, pages, activeTool } = useEditorStore();
    const currentPageId = pages[currentPage - 1]?.id;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleClick = (e: MouseEvent) => {
            // 只在選擇工具模式下處理點擊
            if (activeTool !== 'select') return;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // 查找被點擊的文字標註
            const pageAnnotations = annotations.filter(
                (ann) => ann.pageId === currentPageId && ann.type === 'text'
            );

            for (const ann of pageAnnotations) {
                // 簡單的點擊檢測:檢查點是否在文字區域附近
                const data = ann.data as TextAnnotationData;
                const textWidth = (data.text?.length || 0) * (data.fontSize || 16) * 0.6;
                const textHeight = (data.fontSize || 16) * 1.2;

                if (
                    x >= data.x &&
                    x <= data.x + textWidth &&
                    y >= data.y - textHeight &&
                    y <= data.y
                ) {
                    onTextClick(ann.id);
                    break;
                }
            }
        };

        canvas.addEventListener('click', handleClick);
        return () => canvas.removeEventListener('click', handleClick);
    }, [canvasRef, annotations, currentPageId, activeTool, onTextClick]);
};
