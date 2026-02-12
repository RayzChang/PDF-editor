import { create } from 'zustand';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

export type Tool =
    | 'select'
    | 'hand'
    | 'text'
    | 'draw'
    | 'shape'
    | 'highlight'
    | 'image'
    | 'eraser';

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow' | 'polygon';

export interface PageInfo {
    id: string;
    type: 'original' | 'blank';
    originalIndex?: number; // 1-based, 僅當 type 為 'original' 時有效
    rotation: number; // 獨立旋轉角度 (0, 90, 180, 270)
}

export interface Annotation {
    id: string;
    type: Tool;
    pageId: string;
    data: any;
    timestamp: number;
}

export interface ToolSettings {
    eraserSize: number;
    drawColor: string;
    drawThickness: number;
    shapeBorderColor: string;
    shapeFillColor: string;
    textColor: string;
    fontSize: number;
    highlightColor: string;
    highlightOpacity: number;
    highlightSize: number;
}

export interface NativeTextItem {
    id: string;
    text: string;
    width: number;
    height: number;
    x: number; // PDF space x
    y: number; // PDF space y (Top-Left origin in UI, but originates from PDF baseline)
    yTop: number; // PDF space y (Top-Left origin)
    baselineY: number; // Explicit baseline (Top-Left origin distance)
    fontSize: number;
    fontFamily: string;
    fontStyle?: 'normal' | 'italic';
    fontWeight?: 'normal' | 'bold';
    textDecoration?: 'none' | 'underline';
    color?: string;
    transform: number[];
}

export interface EditorState {
    // PDF 文件
    pdfDocument: PDFDocumentProxy | null;
    pdfFile: File | null;
    fileName: string;

    // 頁面狀態
    pages: PageInfo[]; // 受控頁面列表
    currentPage: number; // 當前在 pages 陣列中的第幾個頁面 (1-based)
    totalPages: number;
    scale: number;
    rotation: number;

    // 工具狀態
    activeTool: Tool;
    activeShape: ShapeType;
    toolSettings: ToolSettings;

    // 標註
    annotations: Annotation[];
    selectedAnnotation: string | null;

    // 原生文字物件 (唯讀，用於編輯模式偵測)
    nativeTextItems: NativeTextItem[];
    setNativeTextItems: (items: NativeTextItem[]) => void;

    // 歷史記錄
    history: Annotation[][];
    historyIndex: number;

    // Actions
    setPdfDocument: (doc: PDFDocumentProxy | null, file: File | null) => void;
    setCurrentPage: (page: number) => void;
    setScale: (scale: number) => void;
    setRotation: (rotation: number) => void;
    setPageRotation: (pageId: string, rotation: number) => void;
    rotateCurrentPage: (delta: number) => void;
    setActiveTool: (tool: Tool) => void;
    setActiveShape: (shape: ShapeType) => void;
    updateToolSettings: (settings: Partial<ToolSettings>) => void;
    addAnnotation: (annotation: Annotation) => void;
    removeAnnotation: (id: string) => void;
    updateAnnotation: (id: string, data: any) => void;
    selectAnnotation: (id: string | null) => void;
    undo: () => void;
    redo: () => void;
    addBlankPage: (atIndex?: number) => void;
    removePage: (pageId: string) => void;
    movePage: (fromIndex: number, toIndex: number) => void;
    clearAnnotations: () => void;
    reset: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    // 初始狀態
    pdfDocument: null,
    pdfFile: null,
    fileName: '',
    pages: [],
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
    rotation: 0,
    activeTool: 'select',
    activeShape: 'rectangle',
    toolSettings: {
        eraserSize: 20,
        drawColor: '#000000',
        drawThickness: 2,
        shapeBorderColor: '#000000',
        shapeFillColor: 'transparent',
        textColor: '#000000',
        fontSize: 16,
        highlightColor: '#FFFF00',
        highlightOpacity: 0.3,
        highlightSize: 20,
    },
    annotations: [],
    selectedAnnotation: null,
    nativeTextItems: [],
    history: [[]],
    historyIndex: 0,

    // Actions
    setNativeTextItems: (items) => set({ nativeTextItems: items }),

    setPdfDocument: (doc, file) => {
        const numPages = doc?.numPages || 0;
        const initialPages: PageInfo[] = Array.from({ length: numPages }).map((_, i) => ({
            id: `p-${i + 1}-${Date.now()}`,
            type: 'original',
            originalIndex: i + 1,
            rotation: 0
        }));

        set({
            pdfDocument: doc,
            pdfFile: file,
            fileName: file?.name || '',
            pages: initialPages,
            totalPages: numPages,
            currentPage: 1,
            annotations: [],
            history: [[]],
            historyIndex: 0,
        });
    },

    setCurrentPage: (page) => {
        const { totalPages } = get();
        if (page >= 1 && page <= totalPages) {
            set({ currentPage: page });
        }
    },

    setScale: (scale) => {
        set({ scale: Math.max(0.25, Math.min(5, scale)) });
    },

    setRotation: (rotation) => {
        set({ rotation: (rotation + 360) % 360 });
    },

    setPageRotation: (pageId, rotation) => {
        const { pages } = get();
        set({
            pages: pages.map(p =>
                p.id === pageId ? { ...p, rotation: (rotation + 360) % 360 } : p
            )
        });
    },

    rotateCurrentPage: (delta) => {
        const { pages, currentPage } = get();
        const pageIndex = currentPage - 1;
        const page = pages[pageIndex];
        if (!page) return;

        const newRotation = (page.rotation + delta + 360) % 360;
        set({
            pages: pages.map((p, i) =>
                i === pageIndex ? { ...p, rotation: newRotation } : p
            )
        });
    },

    setActiveTool: (tool) => {
        set({ activeTool: tool, selectedAnnotation: null });
    },

    setActiveShape: (shape) => {
        set({ activeShape: shape });
    },

    updateToolSettings: (newSettings) => {
        const { toolSettings } = get();
        set({
            toolSettings: { ...toolSettings, ...newSettings }
        });
    },

    addAnnotation: (annotation) => {
        const { annotations, history, historyIndex } = get();
        const newAnnotations = [...annotations, annotation];
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newAnnotations);

        set({
            annotations: newAnnotations,
            history: newHistory,
            historyIndex: historyIndex + 1,
        });
    },

    removeAnnotation: (id) => {
        const { annotations, history, historyIndex } = get();
        const newAnnotations = annotations.filter(a => a.id !== id);
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newAnnotations);

        set({
            annotations: newAnnotations,
            history: newHistory,
            historyIndex: historyIndex + 1,
            selectedAnnotation: null,
        });
    },

    updateAnnotation: (id, data) => {
        const { annotations, history, historyIndex } = get();
        const newAnnotations = annotations.map(a =>
            a.id === id ? { ...a, data: { ...a.data, ...data } } : a
        );
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newAnnotations);

        set({
            annotations: newAnnotations,
            history: newHistory,
            historyIndex: historyIndex + 1,
        });
    },

    selectAnnotation: (id) => {
        set({ selectedAnnotation: id });
    },

    undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
            set({
                annotations: history[historyIndex - 1],
                historyIndex: historyIndex - 1,
            });
        }
    },

    redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
            set({
                annotations: history[historyIndex + 1],
                historyIndex: historyIndex + 1,
            });
        }
    },

    addBlankPage: (atIndex) => {
        const { pages, currentPage } = get();
        const newPage: PageInfo = {
            id: `blank-${Date.now()}`,
            type: 'blank',
            rotation: 0
        };

        const newPages = [...pages];
        const insertIndex = atIndex !== undefined ? atIndex : currentPage; // 預設在當前頁面後插入
        newPages.splice(insertIndex, 0, newPage);

        set({
            pages: newPages,
            totalPages: newPages.length,
            currentPage: insertIndex + 1
        });
    },

    removePage: (pageId) => {
        const { pages, currentPage, annotations } = get();
        if (pages.length <= 1) return;

        const newPages = pages.filter(p => p.id !== pageId);

        // 更新當前頁面
        let newCurrentPage = currentPage;
        if (currentPage > newPages.length) {
            newCurrentPage = newPages.length;
        }

        // 移除該頁面的標註
        const newAnnotations = annotations.filter(a => a.pageId !== pageId);

        set({
            pages: newPages,
            totalPages: newPages.length,
            currentPage: newCurrentPage,
            annotations: newAnnotations
        });
    },

    movePage: (fromIndex, toIndex) => {
        const { pages } = get();
        const newPages = [...pages];
        const [movedPage] = newPages.splice(fromIndex, 1);
        newPages.splice(toIndex, 0, movedPage);

        set({
            pages: newPages,
            currentPage: toIndex + 1
        });
    },

    clearAnnotations: () => {
        set({
            annotations: [],
            history: [[]],
            historyIndex: 0,
            selectedAnnotation: null,
        });
    },

    reset: () => {
        set({
            pdfDocument: null,
            pdfFile: null,
            fileName: '',
            pages: [],
            currentPage: 1,
            totalPages: 0,
            scale: 1.0,
            rotation: 0,
            activeTool: 'select',
            activeShape: 'rectangle',
            annotations: [],
            selectedAnnotation: null,
            history: [[]],
            historyIndex: 0,
        });
    },
}));
