import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation } from '../store/editor-store';

export class PDFSaveUtil {
    /**
     * 將標註寫回到 PDF 並產出新的 Blob
     */
    static async savePDF(
        originalFile: File,
        annotations: Annotation[],
        pagesInfo: any[]
    ): Promise<Blob> {
        const arrayBuffer = await originalFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();

        // 載入標準字體 (作為 Fallback)
        const standardFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const ann of annotations) {
            const { pageId, type, data } = ann;
            // 找出對應的原生頁面索引
            const pageIndex = pagesInfo.findIndex(p => p.id === pageId);
            if (pageIndex === -1) continue;

            // 取得實體頁面 (注意: pages 陣列對應的是 PDF 原始頁面，這裡需要映射)
            const pageInfo = pagesInfo[pageIndex];
            if (pageInfo.type !== 'original') continue;

            const pdfPage = pages[pageInfo.originalIndex - 1];
            const { width, height } = pdfPage.getSize();

            if (type === 'text') {
                // 如果是原生文字編輯
                if (data.isNativeEdit) {
                    // 1. 在原始位置畫一個白塊蓋住舊文字
                    // 注意: PDF 座標是 Y-up，(0,0) 在左下角
                    pdfPage.drawRectangle({
                        x: data.x,
                        y: height - data.y - data.fontSize, // 轉換為 PDF 座標
                        width: data.width || 100, // 這裡需要更精準的寬度計算
                        height: data.fontSize,
                        color: rgb(1, 1, 1), // 白色
                    });
                }

                // 2. 寫入新文字
                pdfPage.drawText(data.text || '', {
                    x: data.x,
                    y: height - data.y - data.fontSize,
                    size: data.fontSize || 12,
                    font: standardFont, // 暫時使用標準字體，進階需嵌入 PDF 原始字體
                    color: hexToRgb(data.color || '#000000'),
                });
            } else if (type === 'draw') {
                // 實作手寫路徑繪製 (SVG Path 或多個 line)
                // 這裡僅作示意
            }
        }

        const pdfBytes = await pdfDoc.save();
        return new Blob([pdfBytes], { type: 'application/pdf' });
    }
}

function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? rgb(
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
    ) : rgb(0, 0, 0);
}
