import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useEditorStore, type NativeTextItem } from '../../store/editor-store';

interface NativeTextLayerProps {
    scale: number;
    rotation: number; // Added for dependency stability
    viewport: any; // PDF.js viewport object
    onTextClick: (item: NativeTextItem) => void;
}

interface TextGroup {
    id: string;
    items: NativeTextItem[];
    x: number;
    y: number;
    yTop: number; // Added
    width: number;
    height: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    baselineY: number; // Added
}

export const NativeTextLayer: React.FC<NativeTextLayerProps> = ({ scale, rotation, viewport, onTextClick }) => {
    const { nativeTextItems, activeTool, annotations } = useEditorStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const editorRef = useRef<HTMLDivElement>(null);

    // Insurance log for mounting/updates (DEV only)
    useEffect(() => {
        if (import.meta.env.DEV) {
            console.log('NativeTextLayer mounted/updated', nativeTextItems.length);
        }
    }, [nativeTextItems]);

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
                    yTop: item.yTop,
                    width: item.width,
                    height: item.height,
                    text: item.text,
                    fontSize: item.fontSize,
                    fontFamily: item.fontFamily,
                    baselineY: item.baselineY // Use calculated baselineY
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
                        yTop: item.yTop,
                        width: item.width,
                        height: item.height,
                        text: item.text,
                        fontSize: item.fontSize,
                        fontFamily: item.fontFamily,
                        baselineY: item.baselineY
                    };
                }
            }
        });

        if (currentGroup) {
            groups.push(currentGroup);
        }

        return groups;
    }, [nativeTextItems, scale, rotation]); // Added scale and rotation to avoid cache issues in production

    // Focus handler
    useEffect(() => {
        if (editingId) {
            requestAnimationFrame(() => {
                editorRef.current?.focus();
            });
        }
    }, [editingId]);

    // Debug update (Only in DEV)
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const debugEl = document.getElementById('debug-text-groups');
        if (debugEl) {
            debugEl.innerText = `Groups: ${textGroups.length}`;
        }
    }, [textGroups.length]);

    const handleBlur = () => {
        if (editingId && editorRef.current) {
            const newText = editorRef.current.innerText;
            const group = textGroups.find(g => g.id === editingId);

            if (group && newText !== group.text) {
                onTextClick({
                    ...group.items[0], // Base props
                    id: group.id,
                    text: newText, // New Text!
                    x: group.x,
                    y: group.y, // Keep original y for reference if needed, but we rely on yTop/baselineY
                    yTop: group.yTop,
                    baselineY: group.baselineY,
                    width: group.width,
                    height: group.height
                });
            }
            setEditingId(null);
        }
    };

    const isTextMode = activeTool === 'text' || activeTool === 'select';

    // Always render the wrapper to avoid early return issues in production states
    // But control visibility/pointer-events based on tool state
    const isVisible = isTextMode && nativeTextItems.length > 0;

    return (
        <div
            className="native-text-layer"
            onClick={() => {
                if (import.meta.env.DEV) console.log('ROOT_TEXT_LAYER_CLICK');
            }}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: isVisible ? 'block' : 'none',
                // 容器本身強制不接收事件，避免攔截 Select/Draw
                pointerEvents: 'none',
                zIndex: 5,
            }}
        >
            {textGroups.map((group) => {
                const isEditing = group.id === editingId;

                // 檢查這一行是否已經有對應的「原生文字編輯標註」
                const hasNativeEditAnnotation = annotations.some(a =>
                    a.type === 'text' &&
                    a.data?.isNativeEdit &&
                    a.data?.originalTextId === group.id
                );

                // 使用 PDF.js viewport 進行精確座標轉換
                let vx = group.x * scale;

                if (viewport) {
                    // vx is the visual x coordinate in screen space
                    const [x] = viewport.convertToViewportPoint(group.x, group.y);
                    vx = x;
                }

                const vScale = viewport?.scale || scale;

                return (
                    <div
                        key={group.id}
                        style={{
                            position: 'absolute',
                            left: vx,
                            top: group.yTop * scale, // Use yTop directly!
                            width: 'auto',
                            maxWidth: isEditing ? 'none' : (group.width * vScale * 1.5),
                            height: 'auto',
                            minWidth: group.width * vScale,
                            minHeight: group.height * vScale,
                            fontSize: `${group.fontSize * vScale}px`,
                            fontFamily: group.fontFamily || 'Arial, sans-serif',
                            lineHeight: 1.2,
                            cursor: 'text',
                            // 規則：
                            // - Text 工具：永遠可以點，做「原地編輯」
                            // - Select 工具：
                            //    * 還沒產生標註 → 允許點擊，建立可拖拉文字框
                            //    * 已有標註     → 讓事件穿透給畫布，交給 useSelectTool 處理拖拉
                            pointerEvents:
                                activeTool === 'text'
                                    ? 'auto'
                                    : (activeTool === 'select' && !hasNativeEditAnnotation)
                                        ? 'auto'
                                        : 'none',
                            whiteSpace: 'pre-wrap',
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
                                    if (import.meta.env.DEV) console.log('TEXT_LAYER_CLICK', group.id, group.text.slice(0, 30));

                                    // Text 工具：永遠做原地編輯
                                    if (activeTool === 'text') {
                                        setEditingId(group.id);
                                        return;
                                    }

                                    // Select 工具：只有在「還沒有對應標註」時，才建立新的可拖拉文字框
                                    if (activeTool === 'select' && !hasNativeEditAnnotation) {
                                        onTextClick({
                                            ...group.items[0],
                                            id: group.id,
                                            text: group.text,
                                            x: group.x,
                                            y: group.y,
                                            yTop: group.yTop,
                                            baselineY: group.baselineY,
                                            width: group.width,
                                            height: group.height
                                        });
                                    }
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
