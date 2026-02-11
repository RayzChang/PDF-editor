import React, { useRef, useState, useEffect, useCallback } from 'react';
import { NativeTextItem } from '../../store/editor-store';
import { cn } from '../../lib/utils'; // Assuming utils exists, if not I will use clsx directly or create it

interface EditableTextBlockProps {
    item: NativeTextItem;
    scale: number;
    isEditing: boolean;
    onStartEditing: () => void;
    onEndEditing: (text: string, style?: Partial<NativeTextItem>) => void;
    onUpdateStyle: (style: Partial<NativeTextItem>) => void;
    onFocus?: (rect: DOMRect) => void;
}

export const EditableTextBlock: React.FC<EditableTextBlockProps> = ({
    item,
    scale,
    isEditing,
    onStartEditing,
    onEndEditing,
    onUpdateStyle,
    onFocus
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [localText, setLocalText] = useState(item.text);

    // Sync input to local state
    const handleInput = useCallback(() => {
        if (editorRef.current) {
            setLocalText(editorRef.current.innerText);
        }
    }, []);

    // Handle blur: commit changes
    const handleBlur = useCallback(() => {
        if (editorRef.current) {
            const newText = editorRef.current.innerText;
            // Only commit if changed ?? actually we might want to commit cleanups too
            onEndEditing(newText, {
                // Return current computed styles? 
                // For now, styles are managed via toolbar which calls onUpdateStyle directly.
            });
        }
    }, [onEndEditing]);

    // Focus management
    useEffect(() => {
        if (isEditing && editorRef.current) {
            editorRef.current.focus();
            // Move cursor to end? Or select all?
            // Usually word-like selection clicks set cursor position. 
            // Browser handles click-to-focus cursor placement naturally if we don't mess with it.
            // But if triggered programmatically, we might need to set range.
        }
    }, [isEditing]);

    // Notify parent about focus rect for toolbar positioning
    const updateFocusRect = useCallback(() => {
        if (isEditing && editorRef.current && onFocus) {
            const rect = editorRef.current.getBoundingClientRect();
            onFocus(rect);
        }
    }, [isEditing, onFocus]);

    useEffect(() => {
        if (isEditing) {
            const interval = setInterval(updateFocusRect, 100); // Poll for position changes (e.g. typing / expansion)
            window.addEventListener('resize', updateFocusRect);
            window.addEventListener('scroll', updateFocusRect, true);
            return () => {
                clearInterval(interval);
                window.removeEventListener('resize', updateFocusRect);
                window.removeEventListener('scroll', updateFocusRect, true);
            };
        }
    }, [isEditing, updateFocusRect]);

    // Styles
    const style: React.CSSProperties = {
        position: 'absolute',
        left: item.x * scale,
        top: item.y * scale,
        width: item.width * scale, // Fixed width? Or min-width? Word wraps.
        minWidth: item.width * scale,
        maxWidth: isEditing ? 'none' : (item.width * scale * 1.5), // Allow expansion when editing?
        // Actually for "Word-like", we usually want it to wrap within the "column" width.
        // But extracting column width is hard.
        // Let's stick to: Auto height, width constrained by original width (approx).
        height: 'auto',
        minHeight: item.height * scale,
        fontSize: `${item.fontSize * scale}px`,
        fontFamily: item.fontFamily || 'Arial, sans-serif',
        lineHeight: 1.2,
        cursor: 'text',
        pointerEvents: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        zIndex: isEditing ? 100 : 1,
        color: item.color || '#000000',
        fontStyle: item.fontStyle || 'normal',
        fontWeight: item.fontWeight || 'normal',
        textDecoration: item.textDecoration || 'none',
        outline: isEditing ? '2px solid #3b82f6' : 'none',
        backgroundColor: isEditing ? 'rgba(255, 255, 255, 0.8)' : 'transparent',
    };

    return (
        <div
            ref={editorRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onClick={(e) => {
                e.stopPropagation();
                if (!isEditing) onStartEditing();
            }}
            onInput={handleInput}
            onBlur={handleBlur}
            onFocus={updateFocusRect}
            onKeyUp={updateFocusRect}
            onMouseUp={updateFocusRect} // Selection changes
            style={style}
            className="native-text-block hover:bg-blue-100/20 active:bg-blue-200/40"
        >
            {item.text}
        </div>
    );
};
