import { useEffect } from 'react';
import { useEditorStore } from '../store/editor-store';

export const useKeyboardShortcuts = () => {
    const { undo, redo, setActiveTool, selectedAnnotation, removeAnnotation } = useEditorStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 忽略輸入元素
            const target = e.target as HTMLElement;
            const isEditable =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                (target as any).isContentEditable;
            if (isEditable) return;

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

            // Delete / Backspace：刪除目前選取的標註（文字/圖片/形狀/筆跡都適用）
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotation) {
                e.preventDefault();
                removeAnnotation(selectedAnnotation);
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
    }, [undo, redo, setActiveTool, selectedAnnotation, removeAnnotation]);
};
