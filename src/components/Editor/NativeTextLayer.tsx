import React from 'react';
import { useEditorStore, type NativeTextItem } from '../../store/editor-store';

interface NativeTextLayerProps {
    scale: number;
    onTextClick: (item: NativeTextItem) => void;
}

export const NativeTextLayer: React.FC<NativeTextLayerProps> = ({ scale, onTextClick }) => {
    const { nativeTextItems, activeTool } = useEditorStore();

    if (activeTool !== 'text' && activeTool !== 'select') return null;

    return (
        <div
            className="native-text-layer"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 5,
            }}
        >
            {nativeTextItems.map((item) => (
                <div
                    key={item.id}
                    onClick={(e) => {
                        e.stopPropagation();
                        onTextClick(item);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        onTextClick(item);
                    }}
                    style={{
                        position: 'absolute',
                        left: item.x * scale,
                        top: item.y * scale,
                        width: item.width * scale,
                        height: item.height * scale,
                        cursor: 'text',
                        pointerEvents: 'auto',
                        background: 'transparent',
                        transition: 'background 0.2s',
                    }}
                    title={item.text}
                    className="native-text-item hover:bg-blue-100/20 active:bg-blue-200/40"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                        e.currentTarget.style.outline = '1px solid rgba(59, 130, 246, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.outline = 'none';
                    }}
                />
            ))}
        </div>
    );
};
