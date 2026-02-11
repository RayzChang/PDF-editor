import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorStore } from '../../store/editor-store';

export const ToolSettings: React.FC = () => {
    const { activeTool, activeShape, setActiveShape, toolSettings, updateToolSettings } = useEditorStore();
    const {
        eraserSize,
        drawColor,
        drawThickness,
        shapeBorderColor,
        shapeFillColor,
        textColor,
        fontSize,
        highlightColor,
        highlightOpacity,
        highlightSize
    } = toolSettings;

    // 將設定值存到 window 物件供舊邏輯使用
    React.useEffect(() => {
        (window as any).editorToolSettings = {
            ...toolSettings,
            highlightColor: `rgba(${parseInt(highlightColor.slice(1, 3), 16)}, ${parseInt(highlightColor.slice(3, 5), 16)}, ${parseInt(highlightColor.slice(5, 7), 16)}, ${highlightOpacity})`,
        };
    }, [toolSettings, highlightColor, highlightOpacity]);

    if (activeTool === 'select' || activeTool === 'hand' || activeTool === 'image') return null;

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={activeTool}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="glass-panel"
                style={{
                    margin: '0 var(--spacing-xl) var(--spacing-md)',
                    padding: 'var(--spacing-sm) var(--spacing-lg)',
                    display: 'flex',
                    gap: 'var(--spacing-lg)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '56px',
                    flexWrap: 'wrap',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-primary)',
                    boxShadow: 'var(--shadow-md)',
                }}
            >
                {/* 橡皮擦設定 */}
                {activeTool === 'eraser' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                        <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            橡皮擦大小
                        </label>
                        <input
                            type="range"
                            min="10"
                            max="50"
                            value={eraserSize}
                            onChange={(e) => updateToolSettings({ eraserSize: Number(e.target.value) })}
                            style={{ width: '120px' }}
                        />
                        <span style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 700, minWidth: '40px' }}>
                            {eraserSize}px
                        </span>
                    </div>
                )}

                {/* 繪圖工具設定 */}
                {activeTool === 'draw' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>顏色</label>
                            <input
                                type="color"
                                value={drawColor}
                                onChange={(e) => updateToolSettings({ drawColor: e.target.value })}
                                style={{ width: '32px', height: '32px', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>粗細</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={drawThickness}
                                onChange={(e) => updateToolSettings({ drawThickness: Number(e.target.value) })}
                                style={{ width: '100px' }}
                            />
                            <span style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 700 }}>
                                {drawThickness}px
                            </span>
                        </div>
                    </div>
                )}

                {/* 形狀工具設定 */}
                {activeTool === 'shape' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>形狀</label>
                            <select
                                value={activeShape}
                                onChange={(e) => setActiveShape(e.target.value as any)}
                                style={{
                                    padding: '4px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-primary)',
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                }}
                            >
                                <option value="rectangle">矩形</option>
                                <option value="circle">圓形</option>
                                <option value="line">線條</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>邊框</label>
                            <input
                                type="color"
                                value={shapeBorderColor}
                                onChange={(e) => updateToolSettings({ shapeBorderColor: e.target.value })}
                                style={{ width: '32px', height: '32px', cursor: 'pointer', border: 'none', padding: 0 }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>填充</label>
                            <input
                                type="color"
                                value={shapeFillColor}
                                onChange={(e) => updateToolSettings({ shapeFillColor: e.target.value })}
                                style={{ width: '32px', height: '32px', cursor: 'pointer', border: 'none', padding: 0 }}
                            />
                        </div>
                    </div>
                )}

                {/* 文字工具設定 */}
                {activeTool === 'text' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>顏色</label>
                            <input
                                type="color"
                                value={textColor}
                                onChange={(e) => updateToolSettings({ textColor: e.target.value })}
                                style={{ width: '32px', height: '32px', cursor: 'pointer', border: 'none', padding: 0 }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>大小</label>
                            <input
                                type="range"
                                min="12"
                                max="48"
                                value={fontSize}
                                onChange={(e) => updateToolSettings({ fontSize: Number(e.target.value) })}
                                style={{ width: '100px' }}
                            />
                            <span style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 700 }}>
                                {fontSize}px
                            </span>
                        </div>
                    </div>
                )}

                {/* 高亮工具設定 */}
                {activeTool === 'highlight' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>顏色</label>
                            <input
                                type="color"
                                value={highlightColor}
                                onChange={(e) => updateToolSettings({ highlightColor: e.target.value })}
                                style={{ width: '32px', height: '32px', cursor: 'pointer', border: 'none', padding: 0 }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>透明度</label>
                            <input
                                type="range"
                                min="0.1"
                                max="0.9"
                                step="0.1"
                                value={highlightOpacity}
                                onChange={(e) => updateToolSettings({ highlightOpacity: Number(e.target.value) })}
                                style={{ width: '80px' }}
                            />
                            <span style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 700 }}>
                                {Math.round(highlightOpacity * 100)}%
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>筆刷</label>
                            <input
                                type="range"
                                min="5"
                                max="50"
                                value={highlightSize}
                                onChange={(e) => updateToolSettings({ highlightSize: Number(e.target.value) })}
                                style={{ width: '80px' }}
                            />
                            <span style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 700 }}>
                                {highlightSize}px
                            </span>
                        </div>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
};
