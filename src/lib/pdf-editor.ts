import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import type { Annotation, PageInfo } from '../store/editor-store';
import { mapToExportCoords } from '../utils/coordinate-utils';

export interface TextModification {
    text: string;
    originalText: string;
    x: number;
    yTop: number; // Replaces y
    baselineY: number; // Required
    width: number;
    height: number;
    fontSize: number;
    fontFamily?: string;
    color?: string; // Hex color
}

/**
 * Modifies a PDF page by redacting original text and overlaying new text.
 */
export async function modifyPageText(
    pdfBytes: Uint8Array | ArrayBuffer,
    pageIndex: number,
    modifications: TextModification[],
    rotation: number = 0
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    if (pageIndex < 0 || pageIndex >= pages.length) {
        throw new Error(`Page index ${pageIndex} out of bounds`);
    }
    const page = pages[pageIndex];

    // 關鍵修正：套用頁面旋轉
    page.setRotation(degrees(rotation));

    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

    const { width: pageWidth, height: pageHeight } = page.getSize();

    for (const mod of modifications) {
        // Use unified mapping logic
        // Use mod.yTop for visual calculations
        const { x: pdfX, y: pdfY, width: pdfW, height: pdfH } = mapToExportCoords(
            mod.x, mod.yTop, mod.width, mod.height, pageWidth, pageHeight, rotation
        );

        // 1. Redact (Visual Deletion): Draw white rectangle over original text
        const expand = 1;

        page.drawRectangle({
            x: pdfX - expand,
            y: pdfY - expand,
            width: pdfW + (expand * 2),
            height: pdfH + (expand * 2),
            color: rgb(1, 1, 1),
            opacity: 1,
        });

        // 2. Select Font
        let font = helveticaFont;
        const lowerFont = (mod.fontFamily || '').toLowerCase();
        if (lowerFont.includes('times')) font = timesRomanFont;
        else if (lowerFont.includes('courier') || lowerFont.includes('mono')) font = courierFont;

        // 3. Parse Color
        let color = rgb(0, 0, 0);
        if (mod.color && mod.color.startsWith('#')) {
            const r = parseInt(mod.color.slice(1, 3), 16) / 255;
            const g = parseInt(mod.color.slice(3, 5), 16) / 255;
            const b = parseInt(mod.color.slice(5, 7), 16) / 255;
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                color = rgb(r, g, b);
            }
        }

        // 4. Draw New Text
        // Always use baselineY for exact vertical alignment
        const { y: pdfBaselineY } = mapToExportCoords(
            mod.x, mod.baselineY, 0, 0, pageWidth, pageHeight, rotation
        );

        // Calculate font metrics for precise baseline alignment
        // Formula requested: y: pdfY + descent
        // In pdf-lib, we can derive descent by comparing height with and without descender.
        const totalHeight = font.heightAtSize(mod.fontSize, { descender: true });
        const ascent = font.heightAtSize(mod.fontSize, { descender: false });
        const descent = ascent - totalHeight; // descent is negative

        // Improve Masking (Redaction)
        // We drew a rectangle at 'pdfY' (mapped from yTop). 
        // We can double check if we want to use font metrics to define the mask height more robustly.
        // But mod.height (from original bounding box) is usually safe for "covering original".

        page.drawText(mod.text, {
            x: pdfX,
            y: pdfBaselineY + descent,
            size: mod.fontSize,
            font: font,
            color: color,
        });
    }

    return await pdfDoc.save();
}

/**
 * PDF Editor class for handling annotations and basic PDF operations.
 */
export class PDFEditor {
    static async loadPDF(file: File): Promise<PDFDocument> {
        const arrayBuffer = await file.arrayBuffer();
        return await PDFDocument.load(arrayBuffer);
    }

    static async applyAnnotations(
        pdfDoc: PDFDocument,
        annotations: Annotation[],
        pagesInfo: PageInfo[]
    ): Promise<PDFDocument> {
        const pages = pdfDoc.getPages();
        if (pages.length === 0) return pdfDoc;

        // Embed standard font for text annotations
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const annotation of annotations) {
            // Find the correct page
            const pageInfo = pagesInfo.find(p => p.id === annotation.pageId);
            if (!pageInfo || pageInfo.type !== 'original' || pageInfo.originalIndex === undefined) continue;

            const pageIndex = pageInfo.originalIndex - 1; // 0-indexed
            if (pageIndex < 0 || pageIndex >= pages.length) continue;

            const page = pages[pageIndex];
            const { width, height } = page.getSize();
            const rotation = pageInfo.rotation || 0;
            const data = annotation.data;

            // Helper to transform points from visual space to PDF space using unified logic
            const toPDF = (x: number, y: number, w: number = 0, h: number = 0) => {
                return mapToExportCoords(x, y, w, h, width, height, rotation);
            };

            // Helper to parse hex color
            const parseColor = (hex: string) => {
                if (!hex || !hex.startsWith('#')) return rgb(0, 0, 0);
                const r = parseInt(hex.slice(1, 3), 16) / 255;
                const g = parseInt(hex.slice(3, 5), 16) / 255;
                const b = parseInt(hex.slice(5, 7), 16) / 255;
                return rgb(r, g, b);
            };

            if (annotation.type === 'text' && data.text) {
                if (data.isNativeEdit) continue;

                const pos = toPDF(data.x, data.y, 0, data.fontSize || 12);
                page.drawText(data.text, {
                    x: pos.x,
                    y: pos.y,
                    size: data.fontSize || 12,
                    font: font,
                    color: parseColor(data.color),
                });
            } else if (annotation.type === 'draw' || annotation.type === 'highlight' || annotation.type === 'eraser') {
                if (data.points && data.points.length > 1) {
                    const path = data.points;
                    let pathColor = parseColor(data.color);
                    let opacity = 1;
                    let thickness = data.thickness || 2;

                    if (annotation.type === 'highlight') {
                        opacity = data.opacity || 0.3;
                        thickness = data.size || 10;
                    } else if (annotation.type === 'eraser') {
                        pathColor = rgb(1, 1, 1);
                        thickness = data.size || 10;
                    }

                    for (let i = 0; i < path.length - 1; i++) {
                        const p1 = toPDF(path[i].x, path[i].y);
                        const p2 = toPDF(path[i + 1].x, path[i + 1].y);
                        page.drawLine({
                            start: { x: p1.x, y: p1.y },
                            end: { x: p2.x, y: p2.y },
                            thickness: thickness,
                            color: pathColor,
                            opacity: opacity,
                        });
                    }
                }
            } else if (annotation.type === 'shape') {
                const borderColor = parseColor(data.borderColor);
                const fillColor = data.fillColor !== 'transparent' ? parseColor(data.fillColor) : undefined;
                const borderWidth = data.borderWidth || 2;
                const pos = toPDF(data.x, data.y, data.width, data.height);

                if (data.shapeType === 'rectangle') {
                    page.drawRectangle({
                        x: pos.x,
                        y: pos.y,
                        width: pos.width,
                        height: pos.height,
                        borderColor: borderColor,
                        borderWidth: borderWidth,
                        color: fillColor,
                        opacity: fillColor ? 1 : 0,
                    });
                } else if (data.shapeType === 'circle') {
                    page.drawEllipse({
                        x: pos.x + pos.width / 2,
                        y: pos.y + pos.height / 2,
                        xScale: pos.width / 2,
                        yScale: pos.height / 2,
                        borderColor: borderColor,
                        borderWidth: borderWidth,
                        color: fillColor,
                        opacity: fillColor ? 1 : 0,
                    });
                }
            } else if (annotation.type === 'image' && data.imageData) {
                try {
                    let image;
                    if (data.imageData.startsWith('data:image/png')) {
                        image = await pdfDoc.embedPng(data.imageData);
                    } else if (data.imageData.startsWith('data:image/jpeg') || data.imageData.startsWith('data:image/jpg')) {
                        image = await pdfDoc.embedJpg(data.imageData);
                    }

                    if (image) {
                        const pos = toPDF(data.x, data.y, data.width, data.height);
                        page.drawImage(image, {
                            x: pos.x,
                            y: pos.y,
                            width: pos.width,
                            height: pos.height,
                        });
                    }
                } catch (e) {
                    console.error('Failed to embed image', e);
                }
            }
        }

        // Apply page rotations
        for (const info of pagesInfo) {
            if (info.type === 'original' && info.originalIndex !== undefined) {
                const p = pages[info.originalIndex - 1];
                if (p) p.setRotation(degrees(info.rotation || 0));
            }
        }

        return pdfDoc;
    }

    static async downloadPDF(pdfDoc: PDFDocument, fileName: string) {
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    static async mergePDFs(files: File[]): Promise<PDFDocument> {
        const mergedPdf = await PDFDocument.create();
        for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        return mergedPdf;
    }
}
