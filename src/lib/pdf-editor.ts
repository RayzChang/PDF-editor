import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Annotation, PageInfo } from '../store/editor-store';
import { mapToExportCoords } from '../utils/coordinate-utils';

/**
 * 清除頁面上所有註解（含表單框線／Widget），讓匯出結果與編輯器一致：
 * 檢視器不會再「後畫」註解層，我們寫入的文字就不會被線條蓋住。
 * 用「依索引 remove」清空 Annots，避免 pdf-lib Issue #1001：removeAnnot(ref) 常對不到 ref 導致刪不掉。
 */
function clearPageAnnotations(page: PDFPage): void {
    type Leaf = { Annots(): { size(): number; remove(i: number): void } | undefined };
    const leaf = (page as unknown as { node: Leaf }).node;
    const annots = leaf.Annots();
    if (!annots) return;
    while (annots.size() > 0) {
        annots.remove(0);
    }
}

/** 標準 PDF 字型只支援 WinAnsi（約 Latin-1），中文等會拋錯。 */
function needsUnicodeFont(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        const code = text.codePointAt(i) ?? 0;
        if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f) || code > 0xff) return true;
        if (code >= 0x100) return true; // CJK 等
    }
    return false;
}

/** 僅保留 WinAnsi 可編碼字元，其餘替換為 ?，避免儲存時拋錯。 */
function toWinAnsiSafe(text: string): string {
    return [...text].map((c) => {
        const code = c.codePointAt(0) ?? 0;
        if (code >= 0x20 && code <= 0x7e) return c;
        if (code >= 0xa0 && code <= 0xff) return c;
        return '?';
    }).join('');
}

/** 快取 CJK 字型 bytes，只 fetch 一次。 */
let cjkFontBytesCache: Uint8Array | null = null;

/** 檢查是否為 fontkit 可辨識的字型格式（TTF/OTF），避免 404 或 SPA 回傳的 HTML 造成 Unknown font format。 */
function isRecognizedFontFormat(bytes: Uint8Array): boolean {
    if (bytes.length < 4) return false;
    // TTF: 0x00 0x01 0x00 0x00 或 'true'
    if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true;
    if (bytes[0] === 0x74 && bytes[1] === 0x72 && bytes[2] === 0x75 && bytes[3] === 0x65) return true; // 'true'
    // OTF: 'OTTO'
    if (bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f) return true;
    return false;
}

async function getCjkFontBytes(): Promise<Uint8Array | null> {
    if (cjkFontBytesCache) return cjkFontBytesCache;
    try {
        // 使用相對路徑以支援 Electron 的 file:// 協定
        const res = await fetch('./fonts/NotoSansTC-VariableFont_wght.ttf', { cache: 'force-cache' });
        if (!res.ok) {
            // 嘗試另一種相對路徑備案
            const res2 = await fetch('fonts/NotoSansTC-VariableFont_wght.ttf', { cache: 'force-cache' });
            if (!res2.ok) return null;
            const ab2 = await res2.arrayBuffer();
            const bytes2 = new Uint8Array(ab2);
            if (!isRecognizedFontFormat(bytes2)) return null;
            cjkFontBytesCache = bytes2;
            return cjkFontBytesCache;
        }
        const ab = await res.arrayBuffer();
        const bytes = new Uint8Array(ab);
        if (!isRecognizedFontFormat(bytes)) return null; // 可能是 404 的 HTML 或錯誤格式
        cjkFontBytesCache = bytes;
        return cjkFontBytesCache;
    } catch {
        return null;
    }
}

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

    let cjkFont: PDFFont | null = null;
    const needsCjk = modifications.some(m => needsUnicodeFont(m.text));
    if (needsCjk) {
        const bytes = await getCjkFontBytes();
        if (bytes) {
            try {
                pdfDoc.registerFontkit(fontkit);
                cjkFont = await pdfDoc.embedFont(bytes);
            } catch (e) {
                console.error('Failed to embed CJK font in modifyPageText:', e);
            }
        }
    }

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
        const isCjk = needsUnicodeFont(mod.text);

        if (isCjk && cjkFont) {
            font = cjkFont;
        } else if (lowerFont.includes('times')) {
            font = timesRomanFont;
        } else if (lowerFont.includes('courier') || lowerFont.includes('mono')) {
            font = courierFont;
        }

        const safeText = (isCjk && cjkFont) ? mod.text : toWinAnsiSafe(mod.text);

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

        page.drawText(safeText, {
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

        // 匯出前清除每頁註解（表單框線等），避免檢視器後畫註解層、蓋住我們寫的字
        for (const page of pages) clearPageAnnotations(page);

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        let cjkFont: PDFFont | null = null;
        const needsCjk = annotations.some(
            (a) => a.type === 'text' && a.data?.text && needsUnicodeFont(a.data.text)
        );
        if (needsCjk) {
            const bytes = await getCjkFontBytes();
            if (bytes) {
                try {
                    pdfDoc.registerFontkit(fontkit);
                    cjkFont = await pdfDoc.embedFont(bytes);
                } catch {
                    // Unknown font format 或其它錯誤時不嵌入，改用 WinAnsi 安全字串
                    cjkFont = null;
                }
            }
        }

        // 繪製順序：先底層再上層，與介面一致；筆跡/橡皮擦最後畫（壓在文字與螢光筆上面）
        const layerOrder: Record<string, number> = {
            highlight: 0,
            shape: 1,
            image: 2,
            text: 3,
            draw: 4,
            eraser: 5,
        };
        const sorted = [...annotations].sort(
            (a, b) => (layerOrder[a.type] ?? 3) - (layerOrder[b.type] ?? 3)
        );

        // 與編輯器紅框完全一致：PAD 4、高度 0.88、寬度係數 0.5（貼合字體）
        const PAD = 4;
        const MAX_WHITE_W = 320;
        const MAX_WHITE_H = 100;

        const getPageCtx = (ann: Annotation) => {
            const pageInfo = pagesInfo.find(p => p.id === ann.pageId);
            if (!pageInfo || pageInfo.type !== 'original' || pageInfo.originalIndex === undefined) return null;
            const pageIndex = pageInfo.originalIndex - 1;
            if (pageIndex < 0 || pageIndex >= pages.length) return null;
            const page = pages[pageIndex];
            const { width, height } = page.getSize();
            const rotation = pageInfo.rotation || 0;
            const toPDF = (x: number, y: number, w: number = 0, h: number = 0) =>
                mapToExportCoords(x, y, w, h, width, height, rotation);
            return { page, toPDF, width, height, rotation };
        };

        const parseColor = (value: string): ReturnType<typeof rgb> => {
            if (!value || typeof value !== 'string') return rgb(0, 0, 0);
            const v = value.trim();
            if (v.startsWith('#')) {
                const r = parseInt(v.slice(1, 3), 16) / 255;
                const g = parseInt(v.slice(3, 5), 16) / 255;
                const b = parseInt(v.slice(5, 7), 16) / 255;
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return rgb(r, g, b);
            }
            const rgbaMatch = v.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (rgbaMatch) {
                const r = Math.min(255, parseInt(rgbaMatch[1], 10)) / 255;
                const g = Math.min(255, parseInt(rgbaMatch[2], 10)) / 255;
                const b = Math.min(255, parseInt(rgbaMatch[3], 10)) / 255;
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return rgb(r, g, b);
            }
            return rgb(0, 0, 0);
        };

        // Pass 1: 只畫「所有文字標註」的白底（先全部蓋完，再畫字，才不會 A 的白底蓋住 B 的字）
        for (const annotation of sorted) {
            if (annotation.type !== 'text' || !annotation.data?.text) continue;
            const ctx = getPageCtx(annotation);
            if (!ctx) continue;
            const { page, toPDF } = ctx;
            const data = annotation.data;
            const fontSize = data.fontSize || 12;
            const textToDraw = data.text || '';
            const lineCount = Math.max(1, textToDraw.split(/\r?\n/).filter(Boolean).length);
            const formulaW = fontSize * (textToDraw.length || 1) * 0.5;
            const formulaH = lineCount * fontSize * 0.88;
            const formulaH_Tight = lineCount * fontSize * 0.65; // 原字位置用更緊高度，不超出黑框、上半部不偏高
            const textW = Math.min(MAX_WHITE_W, (data.width != null && data.width > 0) ? Math.min(data.width, formulaW) : formulaW);
            const textH = Math.min(MAX_WHITE_H, (data.height != null && data.height > 0) ? Math.min(data.height, formulaH) : formulaH);

            const drawWhite = (x: number, y: number, w: number, h: number) => {
                const wCap = Math.min(w, MAX_WHITE_W);
                const hCap = Math.min(h, MAX_WHITE_H);
                const pos = toPDF(x, y, wCap, hCap);
                page.drawRectangle({
                    x: pos.x - PAD,
                    y: pos.y - PAD,
                    width: (pos.width ?? wCap) + PAD * 2,
                    height: (pos.height ?? hCap) + PAD * 2,
                    color: rgb(1, 1, 1),
                    opacity: 1,
                });
            };
            // 原字位置：與編輯器紅框同步，寬高用「原字」範圍（o.width / o.height），不用目前字數 formula 避免只蓋一小塊
            if (data.isNativeEdit && data.nativeEditOrigin) {
                const o = data.nativeEditOrigin;
                const ow = Math.min(MAX_WHITE_W, (o.width != null && o.width > 0) ? o.width : formulaW);
                const oh = Math.min(MAX_WHITE_H, (o.height != null && o.height > 0) ? Math.min(o.height, formulaH_Tight) : formulaH_Tight);
                const oBottom = o.y + (o.height ?? oh);
                const rectY = oBottom - oh;
                drawWhite(o.x, rectY, ow, oh);
            }
            // 目前文字位置：用緊貼公式（與紅框一致），不超出表格
            drawWhite(data.x, data.y, textW, textH);
        }

        // Pass 2: 依序畫所有標註（非文字照舊；文字只畫字，不再畫白底）
        for (const annotation of sorted) {
            const pageInfo = pagesInfo.find(p => p.id === annotation.pageId);
            if (!pageInfo || pageInfo.type !== 'original' || pageInfo.originalIndex === undefined) continue;
            const pageIndex = pageInfo.originalIndex - 1;
            if (pageIndex < 0 || pageIndex >= pages.length) continue;
            const page = pages[pageIndex];
            const { width, height } = page.getSize();
            const rotation = pageInfo.rotation || 0;
            const data = annotation.data;
            const toPDF = (x: number, y: number, w: number = 0, h: number = 0) =>
                mapToExportCoords(x, y, w, h, width, height, rotation);

            if (annotation.type === 'text' && data.text) {
                const fontSize = data.fontSize || 12;
                const textToDraw = data.text || '';
                const lineHeight = fontSize * 1.2;
                const useCjk = cjkFont && needsUnicodeFont(textToDraw);
                const safeText = useCjk ? textToDraw : toWinAnsiSafe(textToDraw);
                const textFont = useCjk ? cjkFont! : font;
                const color = parseColor(data.color);
                const lines = safeText.split(/\r?\n/);
                // 頁面有旋轉時，文字需同向旋轉才會在檢視時維持正常閱讀（與頁面一起轉，才不會顛倒）
                const textRotate = rotation !== 0 ? degrees(rotation) : undefined;
                for (let i = 0; i < lines.length; i++) {
                    if (!lines[i]) continue;
                    const linePos = toPDF(data.x, data.y + i * lineHeight, 0, fontSize);
                    page.drawText(lines[i], {
                        x: linePos.x,
                        y: linePos.y,
                        size: fontSize,
                        font: textFont,
                        color,
                        ...(textRotate !== undefined ? { rotate: textRotate } : {}),
                    });
                }
            } else if (annotation.type === 'draw' || annotation.type === 'highlight' || annotation.type === 'eraser') {
                if (data.points && data.points.length > 1) {
                    const path = data.points;
                    // 若未指定顏色，預設：筆記為黑色，高亮為黃色
                    const baseColorHex = data.color || (annotation.type === 'highlight' ? '#FFFF00' : '#000000');
                    let pathColor = parseColor(baseColorHex);
                    let opacity = 1;
                    let thickness = data.thickness || 2;

                    if (annotation.type === 'highlight') {
                        opacity = data.opacity || 0.3;
                        thickness = data.size || 10;
                        // 若有存顏色但格式既非 #hex 也非 rgba，parseColor 會回黑，匯出會變灰 → 強制黃色
                        const raw = (data.color || '').trim();
                        if (raw && !raw.startsWith('#') && !raw.toLowerCase().startsWith('rgba')) pathColor = rgb(1, 1, 0);
                    } else if (annotation.type === 'eraser') {
                        pathColor = rgb(1, 1, 1);
                        thickness = data.size || 10;
                    }

                    const lineCapRound = 1 as const; // Round cap 讓線段兩端圓滑蓋滿
                    for (let i = 0; i < path.length - 1; i++) {
                        const p1 = toPDF(path[i].x, path[i].y);
                        const p2 = toPDF(path[i + 1].x, path[i + 1].y);
                        const opts: Parameters<typeof page.drawLine>[0] = {
                            start: { x: p1.x, y: p1.y },
                            end: { x: p2.x, y: p2.y },
                            thickness,
                            color: pathColor,
                            opacity,
                        };
                        if (annotation.type === 'eraser' || annotation.type === 'highlight') {
                            (opts as any).lineCap = lineCapRound;
                        }
                        page.drawLine(opts);
                    }
                    // 橡皮擦：在每個路徑點再畫一個白圓，避免線段間隙或端點沒蓋到
                    if (annotation.type === 'eraser' && path.length > 0) {
                        const diameter = data.size || 10;
                        for (const pt of path) {
                            const p = toPDF(pt.x, pt.y);
                            page.drawCircle({
                                x: p.x,
                                y: p.y,
                                size: diameter,
                                color: rgb(1, 1, 1),
                                opacity: 1,
                                borderWidth: 0,
                            });
                        }
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
                        const imageRotate = rotation !== 0 ? degrees(rotation) : undefined;
                        page.drawImage(image, {
                            x: pos.x,
                            y: pos.y,
                            width: pos.width,
                            height: pos.height,
                            ...(imageRotate !== undefined ? { rotate: imageRotate } : {}),
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
