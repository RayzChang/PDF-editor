import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation, PageInfo } from '../store/editor-store';

export interface TextModification {
    text: string;
    originalText: string;
    x: number;
    y: number;
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
    modifications: TextModification[]
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    if (pageIndex < 0 || pageIndex >= pages.length) {
        throw new Error(`Page index ${pageIndex} out of bounds`);
    }
    const page = pages[pageIndex];
    const { height: pageHeight } = page.getSize();

    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

    for (const mod of modifications) {
        // Coordinate Conversion: CSS (Top-Left) to PDF (Bottom-Left)
        // mod.y is the top of the text box in CSS pixels
        // PDF Y is measured from bottom
        const pdfY = pageHeight - mod.y - mod.height;

        // 1. Redact (Visual Deletion): Draw white rectangle over original text
        // Expand slightly to ensure coverage
        const expandX = 1;
        const expandY = 1;

        page.drawRectangle({
            x: mod.x - expandX,
            y: pdfY - expandY,
            width: mod.width + (expandX * 2),
            height: mod.height + (expandY * 2),
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
        // Approximate baseline: PDF-lib draws at the baseline. 
        // Our box bottom is at `pdfY`. 
        // Standard fonts have descent. We need to shift UP from the bottom of the box.
        // A rough heuristic for standard fonts is size * 0.2 approx for descent.
        // However, `pdf-lib` text positioning is strictly baseline.
        // If the box tightly wraps the text including descent, we should add descent.
        page.drawText(mod.text, {
            x: mod.x,
            y: pdfY + (mod.fontSize * 0.2), // Shift up from bottom of box
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
        // Note: Assuming uniform page size for first page check, mostly ok
        if (pages.length === 0) return pdfDoc;

        const { height: firstPageHeight } = pages[0].getSize();

        // Embed standard font for text annotations
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const annotation of annotations) {
            // Find the correct page
            const pageInfo = pagesInfo.find(p => p.id === annotation.pageId);
            if (!pageInfo || pageInfo.type !== 'original' || pageInfo.originalIndex === undefined) continue;

            const pageIndex = pageInfo.originalIndex - 1; // 0-indexed
            if (pageIndex < 0 || pageIndex >= pages.length) continue;

            const page = pages[pageIndex];
            const { height } = page.getSize();
            const data = annotation.data;

            // Helper to parse hex color
            const parseColor = (hex: string) => {
                if (!hex || !hex.startsWith('#')) return rgb(0, 0, 0);
                const r = parseInt(hex.slice(1, 3), 16) / 255;
                const g = parseInt(hex.slice(3, 5), 16) / 255;
                const b = parseInt(hex.slice(5, 7), 16) / 255;
                return rgb(r, g, b);
            };

            if (annotation.type === 'text' && data.text) {
                // Skip native edit text annotations as they are handled by modifyPageText mechanism
                if (data.isNativeEdit) continue;

                page.drawText(data.text, {
                    x: data.x,
                    y: height - data.y - (data.height || 12), // Flip Y. data.y is top-left.
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
                        page.drawLine({
                            start: { x: path[i].x, y: height - path[i].y }, // Flip Y
                            end: { x: path[i + 1].x, y: height - path[i + 1].y },
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
                const rectX = data.x;
                const rectY = height - data.y - data.height; // Flip Y for rectangle (bottom-left corner)

                if (data.shapeType === 'rectangle') {
                    page.drawRectangle({
                        x: rectX,
                        y: rectY,
                        width: data.width,
                        height: data.height,
                        borderColor: borderColor,
                        borderWidth: borderWidth,
                        color: fillColor,
                        opacity: fillColor ? 1 : 0,
                    });
                } else if (data.shapeType === 'circle') {
                    // const radius = Math.min(data.width, data.height) / 2;
                    page.drawEllipse({
                        x: rectX + data.width / 2, // Center X
                        y: rectY + data.height / 2, // Center Y
                        xScale: data.width / 2,
                        yScale: data.height / 2,
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
                        page.drawImage(image, {
                            x: data.x,
                            y: height - data.y - data.height, // Flip Y
                            width: data.width,
                            height: data.height,
                        });
                    }
                } catch (e) {
                    console.error('Failed to embed image', e);
                }
            }
        }

        return pdfDoc;
    }

    static async downloadPDF(pdfDoc: PDFDocument, fileName: string) {
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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
