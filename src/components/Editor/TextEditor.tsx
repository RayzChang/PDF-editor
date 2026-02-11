
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Bold, X, Check } from 'lucide-react';

export const TextEditor: React.FC<{
    annotation: any;
    scale: number;
    onUpdate: (data: { text: string; fontSize?: number; color?: string; fontWeight?: string; fontStyle?: string }) => void;
    onClose: () => void;
}> = ({ annotation, scale, onUpdate, onClose }) => {
    const [text, setText] = useState(annotation.data.text || '');
    const [fontSize, setFontSize] = useState(annotation.data.fontSize || 16);
    const [color, setColor] = useState(annotation.data.color || '#000000');
    const [fontWeight, setFontWeight] = useState(annotation.data.fontWeight || 'normal');
    const fontStyle = annotation.data.fontStyle || 'normal';

    // UI State
    const [showColorPicker, setShowColorPicker] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-focus and select text on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            // Optional: select all text? Maybe just cursor at end is better for editing.
            // inputRef.current.select(); 
        }
    }, []);

    // Auto-resize input width based on content
    useLayoutEffect(() => {
        if (inputRef.current) {
            // Reset width to min to measure true content width
            inputRef.current.style.width = '0px';
            const scrollWidth = inputRef.current.scrollWidth;
            // Add a little buffer
            inputRef.current.style.width = `${Math.max(50, scrollWidth + 10)}px`;
        }
    }, [text, fontSize, fontWeight, fontStyle]);

    const handleSave = () => {
        onUpdate({
            text,
            fontSize,
            color,
            fontWeight,
            fontStyle
        });
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const colors = ['#000000', '#FF0000', '#0000FF', '#008000', '#FFA500', '#800080'];

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                left: (annotation.data.x * scale) - 2, // Check previous offset logic
                top: (annotation.data.y * scale) - 40, // Move toolbar ABOVE the text
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
            }}
            onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to PDF viewer
        >
            {/* Toolbar */}
            <div style={{
                background: '#2d3748',
                borderRadius: '6px',
                padding: '4px',
                display: 'flex',
                gap: '4px',
                marginBottom: '4px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                alignItems: 'center',
                color: 'white'
            }}>
                {/* Font Size Controls */}
                <button
                    onClick={() => setFontSize(Math.max(8, fontSize - 2))}
                    className="p-1 hover:bg-gray-700 rounded text-xs px-2"
                    title="縮小字體"
                >
                    A-
                </button>
                <span style={{ fontSize: '12px', minWidth: '20px', textAlign: 'center' }}>{fontSize}</span>
                <button
                    onClick={() => setFontSize(Math.min(72, fontSize + 2))}
                    className="p-1 hover:bg-gray-700 rounded text-xs px-2"
                    title="放大字體"
                >
                    A+
                </button>

                <div style={{ width: '1px', height: '16px', background: '#4a5568', margin: '0 4px' }} />

                {/* Style Toggles */}
                <button
                    onClick={() => setFontWeight(fontWeight === 'bold' ? 'normal' : 'bold')}
                    className={`p-1 rounded ${fontWeight === 'bold' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                    title="粗體"
                >
                    <Bold size={14} />
                </button>


                <div style={{ width: '1px', height: '16px', background: '#4a5568', margin: '0 4px' }} />

                {/* Color Picker Trigger */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="p-1 hover:bg-gray-700 rounded flex items-center gap-1"
                        title="文字顏色"
                    >
                        <div style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: color,
                            border: '1px solid white'
                        }} />
                    </button>
                    {showColorPicker && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: '0',
                            marginTop: '4px',
                            background: '#2d3748',
                            border: '1px solid #4a5568',
                            borderRadius: '4px',
                            padding: '4px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '4px',
                            zIndex: 1001,
                            width: '80px'
                        }}>
                            {colors.map(c => (
                                <button
                                    key={c}
                                    onClick={() => {
                                        setColor(c);
                                        setShowColorPicker(false);
                                    }}
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        background: c,
                                        border: color === c ? '2px solid white' : '1px solid transparent',
                                        cursor: 'pointer'
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ width: '1px', height: '16px', background: '#4a5568', margin: '0 4px' }} />



                {/* Close / Save Actions */}
                <button
                    onClick={handleSave}
                    className="p-1 hover:bg-green-600 rounded text-green-400 hover:text-white"
                    title="確認"
                >
                    <Check size={14} />
                </button>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-700 rounded"
                    title="取消"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Input Box */}
            <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                // onBlur={handleSave} // Removing auto-save on blur because clicking toolbar triggers blur
                style={{
                    fontSize: `${fontSize * scale}px`,
                    fontFamily: annotation.data.fontFamily || 'Arial',
                    color: color,
                    fontWeight: fontWeight,
                    fontStyle: fontStyle,
                    border: '1px solid #3b82f6',
                    borderRadius: '2px', // Slight rounded
                    padding: '0 2px',
                    margin: '0',
                    background: 'white',
                    outline: 'none',
                    minWidth: '50px',
                    lineHeight: '1.2', // Standard line height
                    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.3)', // Focus ring
                }}
            />
        </div>
    );
};
