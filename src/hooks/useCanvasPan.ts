import { useEffect, useRef, useCallback, useState } from 'react';

export const useCanvasPan = (
    containerRef: React.RefObject<HTMLDivElement | null>
) => {
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });
    const spacePressed = useRef(false);

    // 監聽空白鍵
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 只在非輸入元素時處理空白鍵
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space' && !spacePressed.current) {
                e.preventDefault();
                e.stopPropagation();
                spacePressed.current = true;
                if (containerRef.current) {
                    containerRef.current.style.cursor = 'grab';
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                e.stopPropagation();
                spacePressed.current = false;
                setIsPanning(false);
                if (containerRef.current) {
                    containerRef.current.style.cursor = 'default';
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [containerRef]);

    // 滑鼠事件
    const handleMouseDown = useCallback(
        (e: MouseEvent) => {
            if (spacePressed.current && containerRef.current) {
                setIsPanning(true);
                setPanStart({ x: e.clientX, y: e.clientY });
                setScrollStart({
                    x: containerRef.current.scrollLeft,
                    y: containerRef.current.scrollTop,
                });
                containerRef.current.style.cursor = 'grabbing';
            }
        },
        [containerRef]
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (isPanning && containerRef.current) {
                const dx = e.clientX - panStart.x;
                const dy = e.clientY - panStart.y;
                containerRef.current.scrollLeft = scrollStart.x - dx;
                containerRef.current.scrollTop = scrollStart.y - dy;
            }
        },
        [isPanning, panStart, scrollStart, containerRef]
    );

    const handleMouseUp = useCallback(() => {
        if (isPanning) {
            setIsPanning(false);
            if (containerRef.current && spacePressed.current) {
                containerRef.current.style.cursor = 'grab';
            }
        }
    }, [isPanning, containerRef]);

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
