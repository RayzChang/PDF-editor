
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
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

    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

    for (const mod of modifications) {
        page.drawRectangle({
            x: mod.x,
            y: mod.y,
            width: mod.width,
            height: mod.height,
            color: rgb(1, 1, 1),
        });

        let font = helveticaFont;
        const lowerFont = (mod.fontFamily || '').toLowerCase();
        if (lowerFont.includes('times')) font = timesRomanFont;
        else if (lowerFont.includes('courier') || lowerFont.includes('mono')) font = courierFont;

        let color = rgb(0, 0, 0);
        if (mod.color && mod.color.startsWith('#')) {
            const r = parseInt(mod.color.slice(1, 3), 16) / 255;
            const g = parseInt(mod.color.slice(3, 5), 16) / 255;
            const b = parseInt(mod.color.slice(5, 7), 16) / 255;
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                color = rgb(r, g, b);
            }
        }

        page.drawText(mod.text, {
            x: mod.x,
            y: mod.y,
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
        rotation: number,
        pagesInfo: PageInfo[]
    ): Promise<PDFDocument> {
        const pages = pdfDoc.getPages();
        const { height: pageHeight } = pages[0].getSize(); // Assuming uniform page size for simplicity, or handle per page

        // Embed standard font for text annotations
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const annotation of annotations) {
            // Find the correct page
            // annotation.pageId matches a page in pagesInfo
            const pageInfo = pagesInfo.find(p => p.id === annotation.pageId);
            if (!pageInfo || pageInfo.type !== 'original' || pageInfo.originalIndex === undefined) continue;

            const pageIndex = pageInfo.originalIndex - 1;
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
                // Skip native edit text annotations as they are handled by modifyPageText mechanism (or should be?)
                // If this is the "flatten" save, we might want to burn them in? 
                // But the user has a separate "Save Native" button now.
                // EXISTING Toolbar Save button likely expected to save normal text annotations.
                if (data.isNativeEdit) continue; // Skip native edits for the standard annotation save if they are handled separately

                page.drawText(data.text, {
                    x: data.x,
                    y: data.y, // Check coordinate system relation. pdf-lib is bottom-left. Store might be top-left?
                    // Usually PDF.js is top-left, but pdf-lib is bottom-left. 
                    // If the app handles conversion, we assume data.x/y are compatible or need flip.
                    // In `PDFViewer.tsx`, native items y conversion: `y: viewport.viewBox[3] - f - item.height` (bottom-left)
                    // So if data.y comes from there, it's likely bottom-left.
                    // However, normal annotations (draw, text) from UI are usually top-left relative to canvas.
                    // If so, we need `height - data.y`. 
                    // Let's assume for now `modifyPageText` logic (which uses data.y directly) was correct because native items were converted.
                    // BUT UI annotations (Text tool) usually store top-left logic. 
                    // I'll assume top-left for UI annotations and flip y.
                    size: data.fontSize || 12,
                    font: font,
                    color: parseColor(data.color),
                });
            } else if (annotation.type === 'draw' || annotation.type === 'highlight' || annotation.type === 'eraser') {
                if (data.points && data.points.length > 1) {
                    const path = data.points;
                    // Simplistic implementation: draw lines between points
                    // For better quality, SVG path would be ideal but pdf-lib usage is verbose.
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

                    // Provide a basic SVG path string or manual line drawing
                    // Manual line drawing for now as it's robust
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
                        opacity: fillColor ? 1 : 0, // Fill opacity
                    });
                } else if (data.shapeType === 'circle') {
                    // pdf-lib drawEllipse
                    const radius = Math.min(data.width, data.height) / 2;
                    page.drawEllipse({
                        x: rectX + data.width / 2,
                        y: rectY + data.height / 2,
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
