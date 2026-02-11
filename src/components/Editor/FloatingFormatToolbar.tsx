import React, { useEffect, useState, useRef } from 'react';
import type { NativeTextItem } from '../../store/editor-store';
import { Bold, Italic, Underline, Palette, ChevronDown } from 'lucide-react';

interface FloatingFormatToolbarProps {
    targetRect: DOMRect | null;
    currentStyle: Partial<NativeTextItem>;
    onStyleChange: (style: Partial<NativeTextItem>) => void;
    onClose: () => void;
}

const COLORS = ['#000000', '#FF0000', '#0000FF', '#008000', '#FFA500', '#800080'];
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 30, 36, 48];
const FONT_FAMILIES = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'];

export const FloatingFormatToolbar: React.FC<FloatingFormatToolbarProps> = ({
    targetRect,
    currentStyle,
    onStyleChange,
}) => {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [colorOpen, setColorOpen] = useState(false);
    const [fontOpen, setFontOpen] = useState(false);
    const [sizeOpen, setSizeOpen] = useState(false);

    // Position calculation
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!targetRect || !toolbarRef.current) return;

        // Position above the target rect
        const toolbarHeight = toolbarRef.current.offsetHeight;
        const toolbarWidth = toolbarRef.current.offsetWidth;

        let top = targetRect.top - toolbarHeight - 10;
        let left = targetRect.left + (targetRect.width / 2) - (toolbarWidth / 2);

        // Boundary checks (prevent going off-screen)
        if (top < 10) top = targetRect.bottom + 10; // Flip to bottom if no space on top
        if (left < 10) left = 10;
        if (left + toolbarWidth > window.innerWidth - 10) left = window.innerWidth - toolbarWidth - 10;

        setPosition({ top, left });
    }, [targetRect]);

    if (!targetRect) return null;

    return (
        <div
            ref={toolbarRef}
            className="fixed z-[1000] bg-white rounded-lg shadow-xl border border-slate-200 flex items-center p-1 gap-1 animate-in fade-in zoom-in-95 duration-200"
            style={{
                top: position.top,
                left: position.left,
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent blur
        >
            {/* Font Family */}
            <div className="relative">
                <button
                    onClick={() => setFontOpen(!fontOpen)}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-slate-100 rounded text-sm text-slate-700 max-w-[100px] truncate"
                >
                    {currentStyle.fontFamily || 'Arial'}
                    <ChevronDown size={12} />
                </button>
                {fontOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg py-1 max-h-40 overflow-y-auto w-40 z-50">
                        {FONT_FAMILIES.map(font => (
                            <button
                                key={font}
                                onClick={() => {
                                    onStyleChange({ fontFamily: font });
                                    setFontOpen(false);
                                }}
                                className="block w-full text-left px-3 py-1 hover:bg-slate-100 text-sm"
                                style={{ fontFamily: font }}
                            >
                                {font}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-4 bg-slate-200 mx-1" />

            {/* Font Size */}
            <div className="relative">
                <button
                    onClick={() => setSizeOpen(!sizeOpen)}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-slate-100 rounded text-sm text-slate-700"
                >
                    {Math.round(currentStyle.fontSize || 12)}
                    <ChevronDown size={12} />
                </button>
                {sizeOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg py-1 max-h-40 overflow-y-auto w-16 z-50">
                        {FONT_SIZES.map(size => (
                            <button
                                key={size}
                                onClick={() => {
                                    onStyleChange({ fontSize: size });
                                    setSizeOpen(false);
                                }}
                                className="block w-full text-left px-3 py-1 hover:bg-slate-100 text-sm"
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-4 bg-slate-200 mx-1" />

            {/* Formatting */}
            <button
                onClick={() => onStyleChange({ fontWeight: currentStyle.fontWeight === 'bold' ? 'normal' : 'bold' })}
                className={`p-1.5 rounded hover:bg-slate-100 ${currentStyle.fontWeight === 'bold' ? 'bg-blue-100 text-blue-600' : 'text-slate-600'}`}
                title="Bold"
            >
                <Bold size={16} />
            </button>
            <button
                onClick={() => onStyleChange({ fontStyle: currentStyle.fontStyle === 'italic' ? 'normal' : 'italic' })}
                className={`p-1.5 rounded hover:bg-slate-100 ${currentStyle.fontStyle === 'italic' ? 'bg-blue-100 text-blue-600' : 'text-slate-600'}`}
                title="Italic"
            >
                <Italic size={16} />
            </button>
            <button
                onClick={() => onStyleChange({ textDecoration: currentStyle.textDecoration === 'underline' ? 'none' : 'underline' })}
                className={`p-1.5 rounded hover:bg-slate-100 ${currentStyle.textDecoration === 'underline' ? 'bg-blue-100 text-blue-600' : 'text-slate-600'}`}
                title="Underline"
            >
                <Underline size={16} />
            </button>

            <div className="w-px h-4 bg-slate-200 mx-1" />

            {/* Color */}
            <div className="relative">
                <button
                    onClick={() => setColorOpen(!colorOpen)}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-600 flex items-center gap-1"
                    title="Text Color"
                >
                    <Palette size={16} style={{ color: currentStyle.color || '#000000' }} />
                </button>
                {colorOpen && (
                    <div className="absolute top-full right-0 mt-1 bg-white border rounded shadow-lg p-2 grid grid-cols-3 gap-1 z-50 w-24">
                        {COLORS.map(color => (
                            <button
                                key={color}
                                onClick={() => {
                                    onStyleChange({ color });
                                    setColorOpen(false);
                                }}
                                className="w-6 h-6 rounded-full border border-slate-200"
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
