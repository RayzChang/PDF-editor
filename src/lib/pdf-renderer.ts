
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

// 設定 PDF.js worker - 使用標準的 Vite/ESM 載入模式
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

console.log('PDF Renderer Initialized with worker:', pdfjsLib.GlobalWorkerOptions.workerSrc);

interface RenderTaskInfo {
    cancel: () => void;
    promise: Promise<void>;
}

export class PDFRenderer {
    // Store both official RenderTasks and our own async placeholders
    private activeRenderTasks: WeakMap<HTMLCanvasElement, RenderTaskInfo> = new WeakMap();
    private document: PDFDocumentProxy | null = null;

    /**
     * 載入 PDF 檔案
     */
    async loadPDF(file: File): Promise<PDFDocumentProxy> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
                cMapPacked: true,
                standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
            });
            this.document = await loadingTask.promise;
            return this.document;
        } catch (error) {
            console.error('載入 PDF 失敗:', error);
            throw new Error('無法載入 PDF 檔案');
        }
    }

    /**
     * 載入 PDF URL
     */
    async loadPDFFromURL(url: string): Promise<PDFDocumentProxy> {
        try {
            const loadingTask = pdfjsLib.getDocument({
                url,
                cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
                cMapPacked: true,
                standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
            });
            this.document = await loadingTask.promise;
            return this.document;
        } catch (error) {
            console.error('載入 PDF 失敗:', error);
            throw new Error('無法載入 PDF 檔案');
        }
    }

    /**
     * 取得頁面
     */
    async getPage(pageNumber: number): Promise<PDFPageProxy> {
        if (!this.document) {
            throw new Error('PDF 文件未載入');
        }
        return await this.document.getPage(pageNumber);
    }

    /**
     * 渲染頁面到 Canvas
     */
    async renderPage(
        pageNumber: number,
        canvas: HTMLCanvasElement,
        scale: number = 1.0,
        rotation: number = 0
    ): Promise<void> {
        // 1. Cancel any existing render task on this canvas AND reserve the slot
        const existingTask = this.activeRenderTasks.get(canvas);
        if (existingTask) {
            existingTask.cancel();
            // Wait for it to clear? Usually strict cancellation is enough.
            // But to be safe, we can await its promise catch.
            try {
                await existingTask.promise;
            } catch (e) {
                // Ignore cancel error
            }
        }

        // 2. Create a cancellation token/controller for THIS render flow
        let isCancelled = false;
        let pdfRenderTask: any = null;

        const cancel = () => {
            isCancelled = true;
            if (pdfRenderTask) {
                pdfRenderTask.cancel();
            }
        };

        // 3. Register IT IMMEDIATELY to block other renders
        // We create a promise that exposes the execution flow for tracking
        const renderExecution = (async () => {
            try {
                if (isCancelled) return;

                const page = await this.getPage(pageNumber);
                if (isCancelled) return;

                const viewport = page.getViewport({ scale, rotation });

                const context = canvas.getContext('2d');
                if (!context) {
                    throw new Error('無法取得 Canvas 上下文');
                }

                // Ensure canvas dimensions match viewport
                if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                }

                const renderContext: any = {
                    canvasContext: context,
                    viewport: viewport,
                };

                // Critical: Check cancel right before render
                if (isCancelled) return;

                pdfRenderTask = page.render(renderContext);
                await pdfRenderTask.promise;
            } catch (error: any) {
                if (isCancelled || error.name === 'RenderingCancelledException') {
                    // Normal cancellation
                    return;
                }
                console.error('渲染頁面失敗:', error);
                // throw error; // Don't crash
            } finally {
                // If this specific task is still the active one, clear it
                const current = this.activeRenderTasks.get(canvas);
                if (current && current.promise === renderPromise) {
                    this.activeRenderTasks.delete(canvas);
                }
            }
        })();

        // Wrap the execution in an object we can store
        const renderPromise = renderExecution; // It's already a promise

        this.activeRenderTasks.set(canvas, {
            cancel,
            promise: renderPromise
        });

        await renderPromise;
    }

    /**
     * 渲染縮圖
     */
    async renderThumbnail(
        pageNumber: number,
        canvas: HTMLCanvasElement,
        maxWidth: number = 150,
        rotation: number = 0
    ): Promise<void> {
        try {
            const page = await this.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.0, rotation });

            // 計算縮圖比例
            const scale = maxWidth / viewport.width;
            const thumbnailViewport = page.getViewport({ scale });

            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error('無法取得 Canvas 上下文');
            }

            canvas.width = thumbnailViewport.width;
            canvas.height = thumbnailViewport.height;

            const renderContext: any = {
                canvasContext: context,
                viewport: thumbnailViewport,
            };

            await page.render(renderContext).promise;
        } catch (error) {
            console.error('渲染縮圖失敗:', error);
            // throw new Error('無法渲染縮圖');
        }
    }

    /**
     * 取得頁面數量
     */
    getPageCount(): number {
        return this.document?.numPages || 0;
    }

    /**
     * 取得文件資訊
     */
    async getMetadata() {
        if (!this.document) {
            throw new Error('PDF 文件未載入');
        }
        return await this.document.getMetadata();
    }

    /**
     * 取得頁面文字內容並轉換為 NativeTextItem 陣列
     */
    async getPageTextContent(pageNumber: number, rotation: number = 0): Promise<any[]> {
        try {
            const page = await this.getPage(pageNumber);
            // 使用傳入的旋轉角度取得 viewport
            const viewport = page.getViewport({ scale: 1.0, rotation });
            const textContent = await page.getTextContent();

            return textContent.items.map((item: any, index: number) => {
                const [a, b, , , e, f] = item.transform;

                // 處理 PDF.js 的 transform 矩陣
                // PDF.js 提供的 transform 是相對於原始未旋轉頁面的 (0 rotation)
                // 我們需要將其點 (e, f) 轉換到旋轉後的座標
                const transformed = pdfjsLib.Util.transform(viewport.transform, [e, f]);
                const tx = transformed[0];
                const ty = transformed[1];

                const fontSize = Math.sqrt(a * a + b * b);
                const height = (item.height && item.height > 0) ? item.height : fontSize;

                return {
                    id: `native-${index}`,
                    text: item.str,
                    width: item.width,
                    height: height,
                    x: tx,
                    // pdfjsLib.Util.transform 之後的 ty 是相對於 viewport 左上角的
                    y: ty - height,
                    fontSize: fontSize,
                    fontFamily: item.fontName,
                    transform: item.transform
                };
            });
        } catch (error) {
            console.error('取得文字內容失敗:', error);
            throw new Error('無法取得 PDF 文字內容');
        }
    }

    /**
     * 取得頁面原始文字內容物件 (PDF.js 原生格式)
     */
    async getTextContent(pageNumber: number) {
        try {
            const page = await this.getPage(pageNumber);
            return await page.getTextContent();
        } catch (error) {
            console.error('取得文字內容失敗:', error);
            throw new Error('無法取得 PDF 文字內容');
        }
    }

    /**
     * 清理資源
     */
    destroy() {
        if (this.document) {
            this.document.destroy();
            this.document = null;
        }
    }
}

// 單例模式
export const pdfRenderer = new PDFRenderer();
