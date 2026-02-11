/**
 * Unified Coordinate Utility for PDF Editing
 * 
 * Handles transformations between Screen (CSS) coordinates and PDF coordinates,
 * taking into account page rotation (0, 90, 180, 270 degrees).
 */

export interface Point {
    x: number;
    y: number;
}

/**
 * Converts screen-space client coordinates (clientX, clientY) to PDF-space coordinates.
 * Screen Origin: Top-Left
 * PDF Origin: Top-Left (for editing/visual consistency in our app, mapped to Bottom-Left for final export)
 * 
 * @param clientX Mouse event clientX
 * @param clientY Mouse event clientY
 * @param containerRect Bounding rect of the page container/layer
 * @param scale Current zoom scale
 * @param rotation Current page rotation in degrees
 */
export function convertMouseToPdfCoords(
    clientX: number,
    clientY: number,
    containerRect: DOMRect,
    scale: number,
    _rotation: number
): Point {
    // 1. Get relative offsets within the container
    const offsetX = clientX - containerRect.left;
    const offsetY = clientY - containerRect.top;

    // 2. Adjust for scale to get unscaled "virtual" screen coordinates
    const unscaledX = offsetX / scale;
    const unscaledY = offsetY / scale;

    // Because we use "True Rotation" (Canvas itself is rotated),
    // the unscaledX/Y ARE already in the rotated coordinate space of the canvas.
    // However, for consistency and future-proofing, if we ever needed to un-rotate:
    // ... logic would go here ...

    // In our "True Rotation" architecture, PDF.js renders a viewport that is already rotated.
    // So if a page is 100x200 and rotated 90deg, the canvas is 200x100.
    // The offsetX/Y relative to that canvas are the direct coordinates.

    return { x: unscaledX, y: unscaledY };
}

/**
 * Converts PDF-space coordinates to Screen-space displacement.
 * This is used for positioning DOM elements (like text editor or native text items)
 * over the canvas.
 * 
 * @param pdfX Coordinate in PDF space (unscaled)
 * @param pdfY Coordinate in PDF space (unscaled)
 * @param scale Current zoom scale
 * @param rotation Current page rotation (not strictly needed for position if PDF-space is already rotated)
 */
export function convertPdfToScreenCoords(
    pdfX: number,
    pdfY: number,
    scale: number,
    _rotation: number // Keeping for signature consistency as requested
): Point {
    // In "True Rotation", visual PDF coordinates are already aligned with the rotated view.
    return {
        x: pdfX * scale,
        y: pdfY * scale
    };
}

/**
 * Maps a visual rectangle to PDF export coordinates (Bottom-Left origin).
 * Used in pdf-editor.ts for final save.
 */
export function mapToExportCoords(
    visualX: number,
    visualY: number,
    visualWidth: number,
    visualHeight: number,
    pageWidth: number,
    pageHeight: number,
    rotation: number
) {
    const rot = rotation % 360;
    let pdfX, pdfY, pdfW, pdfH;

    if (rot === 90) {
        pdfX = visualY;
        pdfY = visualX;
        pdfW = visualHeight;
        pdfH = visualWidth;
    } else if (rot === 180) {
        pdfX = pageWidth - visualX - visualWidth;
        pdfY = visualY;
        pdfW = visualWidth;
        pdfH = visualHeight;
    } else if (rot === 270) {
        pdfX = pageWidth - visualY - visualHeight;
        pdfY = pageHeight - visualX - visualWidth;
        pdfW = visualHeight;
        pdfH = visualWidth;
    } else {
        pdfX = visualX;
        pdfY = pageHeight - visualY - visualHeight;
        pdfW = visualWidth;
        pdfH = visualHeight;
    }

    return { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
}

