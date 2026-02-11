import { useEffect } from 'react';
import { useEditorStore } from '../store/editor-store';

export const useKeyboardShortcuts = () => {
    const { undo, redo, setActiveTool } = useEditorStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 忽略輸入元素
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            // Ctrl+Z: 撤銷
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }

            // Ctrl+Shift+Z 或 Ctrl+Y: 重做
            if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
                e.preventDefault();
                redo();
            }

            // ESC: 切換到選擇工具
            if (e.key === 'Escape') {
                setActiveTool('select');
            }

            // 數字鍵快捷鍵
            if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
                switch (e.key) {
                    case '1':
                        setActiveTool('select');
                        break;
                    case '2':
                        setActiveTool('text');
                        break;
                    case '3':
                        setActiveTool('draw');
                        break;
                    case '4':
                        setActiveTool('shape');
                        break;
                    case '5':
                        setActiveTool('highlight');
                        break;
                    case '6':
                        setActiveTool('eraser');
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, setActiveTool]);
};
