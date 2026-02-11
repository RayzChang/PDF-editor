import React, { useMemo, useState, useRef } from 'react';
import { useEditorStore, type NativeTextItem } from '../../store/editor-store';

interface NativeTextLayerProps {
    scale: number;
    onTextClick: (item: NativeTextItem) => void;
}

interface TextGroup {
    id: string;
    items: NativeTextItem[];
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    fontSize: number;
    fontFamily: string;
}

export const NativeTextLayer: React.FC<NativeTextLayerProps> = ({ scale, onTextClick }) => {
    const { nativeTextItems, activeTool } = useEditorStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const editorRef = useRef<HTMLDivElement>(null);

    // Group text items into lines/paragraphs
    const textGroups = useMemo(() => {
        if (nativeTextItems.length === 0) return [];

        // Sort by Y (top to bottom), then X (left to right)
        const sorted = [...nativeTextItems].sort((a, b) => {
            if (Math.abs(a.y - b.y) < 5) { // Same line tolerance
                return a.x - b.x;
            }
            return a.y - b.y;
        });

        const groups: TextGroup[] = [];
        let currentGroup: TextGroup | null = null;

        sorted.forEach((item) => {
            if (!currentGroup) {
                currentGroup = {
                    id: `group-${item.id}`,
                    items: [item],
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                    text: item.text,
                    fontSize: item.fontSize,
                    fontFamily: item.fontFamily
                };
            } else {
                // Check if belongs to same line:
                // 1. Y difference is small
                // 2. X position is close to previous item's end
                const prevItem = currentGroup.items[currentGroup.items.length - 1];
                const isSameLine = Math.abs(item.y - prevItem.y) < (item.height * 0.5);
                const isAdjacent = Math.abs(item.x - (prevItem.x + prevItem.width)) < (item.fontSize * 2); // 2 em spaces tolerance

                if (isSameLine && isAdjacent) {
                    // Add space if needed
                    const spaceNeeded = (item.x - (prevItem.x + prevItem.width)) > (item.fontSize * 0.3);
                    const separator = spaceNeeded ? ' ' : '';

                    currentGroup.items.push(item);
                    currentGroup.text += separator + item.text;
                    currentGroup.width = (item.x + item.width) - currentGroup.x;
                    currentGroup.height = Math.max(currentGroup.height, item.height);
                } else {
                    // New group
                    groups.push(currentGroup);
                    currentGroup = {
                        id: `group-${item.id}`,
                        items: [item],
                        x: item.x,
                        y: item.y,
                        width: item.width,
                        height: item.height,
                        text: item.text,
                        fontSize: item.fontSize,
                        fontFamily: item.fontFamily
                    };
                }
            }
        });

        if (currentGroup) {
            groups.push(currentGroup);
        }

        return groups;
    }, [nativeTextItems]);

    const handleBlur = () => {
        if (editingId && editorRef.current) {
            const newText = editorRef.current.innerText;
            const group = textGroups.find(g => g.id === editingId);

            if (group && newText !== group.text) {
                // Create a text annotation that represents the "Native Edit"
                // Ideally this triggers the PDF modification logic we planned.
                // For now, we reuse the "addAnnotation" flow but with 'isNativeEdit' flag
                // which our PDFViewer handles by calling modifyPageText logic.

                // We need to pass the "Union Rect" of the original items to be redacted.
                // We can synthesize a "NativeTextItem" like structure.

                // Trigger the flow via onTextClick logic which adds annotation
                // Or call addAnnotation directly.
                // onTextClick in PDFViewer creates the annotation.
                // But onTextClick expects a NativeTextItem.
                // Let's adapt it.

                onTextClick({
                    ...group.items[0], // Base props
                    id: group.id,
                    text: newText, // New Text!
                    x: group.x,
                    y: group.y,
                    width: group.width,
                    height: group.height
                });
            }
            setEditingId(null);
        }
    };

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
            {textGroups.map((group) => {
                const isEditing = group.id === editingId;

                return (
                    <div
                        key={group.id}
                        style={{
                            position: 'absolute',
                            left: group.x * scale,
                            top: group.y * scale,
                            width: 'auto', // Let it grow if editing
                            maxWidth: isEditing ? 'none' : (group.width * scale * 1.5), // Allow some overflow
                            height: 'auto',
                            minWidth: group.width * scale,
                            minHeight: group.height * scale,
                            fontSize: `${group.fontSize * scale}px`,
                            fontFamily: group.fontFamily || 'Arial, sans-serif',
                            lineHeight: 1.2, // Match PDF line height approx
                            cursor: 'text',
                            pointerEvents: 'auto',
                            whiteSpace: 'pre-wrap', // Preserve spaces
                            zIndex: isEditing ? 100 : 1,
                        }}
                        className={`native-text-group ${isEditing ? 'editing' : ''}`}
                    >
                        {isEditing ? (
                            <div
                                ref={editorRef}
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={handleBlur}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        editorRef.current?.blur();
                                    }
                                }}
                                style={{
                                    outline: '2px solid #3b82f6',
                                    background: 'white',
                                    color: 'black',
                                    padding: '2px',
                                    borderRadius: '2px',
                                    minWidth: group.width * scale + 'px'
                                }}
                            >
                                {group.text}
                            </div>
                        ) : (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(group.id);
                                    // Focus needs to happen after render
                                    setTimeout(() => {
                                        if (editorRef.current) {
                                            editorRef.current.focus();
                                        }
                                    }, 0);
                                }}
                                style={{
                                    color: 'transparent', // Hide text but keep selectable? 
                                    // No, we want to SEE the text and overlay it.
                                    // If we make it color: transparent, we see the canvas below.
                                    // This is good for "Selection" feel.
                                    // But to "Edit", we ideally replace it.
                                    // For now: Transparent overlay to allow native canvas text to show.
                                    // On Hover: Highlight.
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                                    e.currentTarget.style.outline = '1px solid rgba(59, 130, 246, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.outline = 'none';
                                }}
                            >
                                {/* We render invisible text to allow browser selection/search if needed, 
                                    but main visual is canvas */}
                                <span style={{ opacity: 0 }}>{group.text}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
