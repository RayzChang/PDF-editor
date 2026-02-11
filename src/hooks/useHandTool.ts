import { useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../store/editor-store';

export const useHandTool = (
    containerRef: React.RefObject<HTMLDivElement | null>
) => {
    const { activeTool } = useEditorStore();
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

    const handleMouseDown = useCallback(
        (e: MouseEvent) => {
            // 只在手抓工具模式下處理
            if (activeTool !== 'hand') return;
            // 僅允許左鍵拖曳
            if (e.button !== 0) return;

            const container = containerRef.current;
            if (!container) return;

            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            setScrollStart({
                x: container.scrollLeft,
                y: container.scrollTop,
            });
            container.style.cursor = 'grabbing';
            e.preventDefault();
        },
        [activeTool, containerRef]
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isPanning || activeTool !== 'hand') return;

            const container = containerRef.current;
            if (!container) return;

            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            container.scrollLeft = scrollStart.x - dx;
            container.scrollTop = scrollStart.y - dy;

            console.log('[PAN]',
                'dx=', dx,
                'scrollLeft=', container.scrollLeft,
                'scrollWidth=', container.scrollWidth,
                'clientWidth=', container.clientWidth
            );
        },
        [isPanning, panStart, scrollStart, containerRef, activeTool]
    );

    const handleMouseUp = useCallback(() => {
        if (!isPanning) return;

        setIsPanning(false);
        const container = containerRef.current;
        if (container && activeTool === 'hand') {
            container.style.cursor = 'grab';
        }
    }, [isPanning, containerRef, activeTool]);

    // 更新游標樣式
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        if (activeTool === 'hand') {
            container.style.cursor = 'grab';
        } else {
            container.style.cursor = 'default';
        }
    }, [activeTool, containerRef]);

    // 註冊事件
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('mousedown', handleMouseDown as any);
        window.addEventListener('mousemove', handleMouseMove as any);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            container.removeEventListener('mousedown', handleMouseDown as any);
            window.removeEventListener('mousemove', handleMouseMove as any);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [containerRef, handleMouseDown, handleMouseMove, handleMouseUp]);

    return { isPanning };
};
