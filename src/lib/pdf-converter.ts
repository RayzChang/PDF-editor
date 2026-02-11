import { PDFDocument } from 'pdf-lib';
import { PDFEditor } from './pdf-editor';
import { pdfRenderer } from './pdf-renderer';

export type ConversionFormat = 'png' | 'jpg' | 'pdf' | 'docx';

export class PDFConverter {
    /**
     * PDF 轉圖片
     */
    static async pdfToImage(
        file: File,
        format: 'png' | 'jpg' = 'png',
        quality: number = 0.95
    ): Promise<Blob[]> {
        try {
            const pdfDoc = await pdfRenderer.loadPDF(file);
            const pageCount = pdfDoc.numPages;
            const images: Blob[] = [];

            for (let i = 1; i <= pageCount; i++) {
                const canvas = document.createElement('canvas');
                await pdfRenderer.renderPage(i, canvas, 2.0); // 高解析度

                const blob = await new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob(
                        (blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error('轉換失敗'));
                        },
                        `image/${format}`,
                        quality
                    );
                });

                images.push(blob);
            }

            return images;
        } catch (error) {
            console.error('PDF 轉圖片失敗:', error);
            throw new Error('PDF 轉圖片失敗');
        }
    }

    /**
     * 圖片轉 PDF
     */
    static async imageToPDF(imageFiles: File[]): Promise<Uint8Array> {
        try {
            const pdfDoc = await PDFDocument.create();

            for (const file of imageFiles) {
                const arrayBuffer = await file.arrayBuffer();
                let image;

                if (file.type === 'image/png') {
                    image = await pdfDoc.embedPng(arrayBuffer);
                } else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                    image = await pdfDoc.embedJpg(arrayBuffer);
                } else {
                    throw new Error(`不支援的圖片格式: ${file.type}`);
                }

                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: image.width,
                    height: image.height,
                });
            }

            return await pdfDoc.save();
        } catch (error) {
            console.error('圖片轉 PDF 失敗:', error);
            throw new Error('圖片轉 PDF 失敗');
        }
    }

    /**
     * 合併 PDF
     */
    static async mergePDFs(pdfFiles: File[]): Promise<Uint8Array> {
        try {
            const mergedPdf = await PDFEditor.mergePDFs(pdfFiles);
            return await mergedPdf.save();
        } catch (error) {
            console.error('合併 PDF 失敗:', error);
            throw new Error('合併 PDF 失敗');
        }
    }

    /**
     * 分割 PDF
     */
    static async splitPDF(
        file: File,
        ranges: { start: number; end: number }[]
    ): Promise<Uint8Array[]> {
        try {
            const pdfDoc = await PDFEditor.loadPDF(file);
            const splitPdfs: Uint8Array[] = [];

            for (const range of ranges) {
                const newPdf = await PDFDocument.create();
                const pageIndices = [];

                for (let i = range.start - 1; i < range.end; i++) {
                    pageIndices.push(i);
                }

                const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
                copiedPages.forEach((page) => newPdf.addPage(page));

                splitPdfs.push(await newPdf.save());
            }

            return splitPdfs;
        } catch (error) {
            console.error('分割 PDF 失敗:', error);
            throw new Error('分割 PDF 失敗');
        }
    }

    /**
     * 下載檔案
     */
    static downloadFile(data: Blob | Uint8Array, filename: string, mimeType: string): void {
        const blob = data instanceof Blob ? data : new Blob([data as any], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * 批次下載圖片
     */
    static async downloadImages(images: Blob[], baseName: string, format: string): Promise<void> {
        images.forEach((blob, index) => {
            this.downloadFile(
                blob,
                `${baseName}_page_${index + 1}.${format}`,
                `image/${format}`
            );
        });
    }
}
