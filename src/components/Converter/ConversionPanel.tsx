import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, Download } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';
import { PDFConverter } from '../../lib/pdf-converter';

export const ConversionPanel: React.FC = () => {
    const { t } = useTranslation();
    const { converterOpen, setConverterOpen, setLoading, setError } = useUIStore();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [conversionType, setConversionType] = useState<'pdfToImage' | 'imageToPdf' | 'merge' | 'split'>('pdfToImage');
    const [imageFormat, setImageFormat] = useState<'png' | 'jpg'>('png');

    if (!converterOpen) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setSelectedFiles(files);
    };

    const handleConvert = async () => {
        if (selectedFiles.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            switch (conversionType) {
                case 'pdfToImage':
                    const images = await PDFConverter.pdfToImage(selectedFiles[0], imageFormat);
                    await PDFConverter.downloadImages(images, selectedFiles[0].name.replace('.pdf', ''), imageFormat);
                    break;

                case 'imageToPdf':
                    const pdfBytes = await PDFConverter.imageToPDF(selectedFiles);
                    PDFConverter.downloadFile(pdfBytes, 'converted.pdf', 'application/pdf');
                    break;

                case 'merge':
                    const mergedPdf = await PDFConverter.mergePDFs(selectedFiles);
                    PDFConverter.downloadFile(mergedPdf, 'merged.pdf', 'application/pdf');
                    break;

                case 'split':
                    // 簡化版本:分割成單頁
                    const splitPdfs = await PDFConverter.splitPDF(selectedFiles[0], [
                        { start: 1, end: 1 },
                        { start: 2, end: 2 },
                    ]);
                    splitPdfs.forEach((pdf, index) => {
                        PDFConverter.downloadFile(pdf, `split_${index + 1}.pdf`, 'application/pdf');
                    });
                    break;
            }

            setSelectedFiles([]);
        } catch (error) {
            console.error('轉換失敗:', error);
            setError('轉換失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div
                className="overlay"
                onClick={() => setConverterOpen(false)}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 1040,
                }}
            />

            <div
                className="conversion-panel"
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '90%',
                    maxWidth: '600px',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-xl)',
                    zIndex: 1050,
                    overflow: 'hidden',
                }}
            >
                {/* 標題列 */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--spacing-lg)',
                        borderBottom: '1px solid var(--border-primary)',
                        background: 'var(--gradient-primary)',
                        color: 'white',
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                        {t('converter.title')}
                    </h2>
                    <button
                        onClick={() => setConverterOpen(false)}
                        style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--spacing-xs)',
                            cursor: 'pointer',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 內容 */}
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    {/* 轉換類型選擇 */}
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <label style={{ display: 'block', marginBottom: 'var(--spacing-sm)', fontWeight: 500 }}>
                            {t('converter.selectFormat')}
                        </label>
                        <select
                            value={conversionType}
                            onChange={(e) => setConversionType(e.target.value as any)}
                            style={{
                                width: '100%',
                                padding: 'var(--spacing-sm) var(--spacing-md)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-primary)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <option value="pdfToImage">{t('converter.pdfToImage')}</option>
                            <option value="imageToPdf">{t('converter.imageToPdf')}</option>
                            <option value="merge">{t('converter.merge')}</option>
                            <option value="split">{t('converter.split')}</option>
                        </select>
                    </div>

                    {/* 圖片格式選擇 */}
                    {conversionType === 'pdfToImage' && (
                        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                            <label style={{ display: 'block', marginBottom: 'var(--spacing-sm)', fontWeight: 500 }}>
                                圖片格式
                            </label>
                            <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                                    <input
                                        type="radio"
                                        value="png"
                                        checked={imageFormat === 'png'}
                                        onChange={(e) => setImageFormat(e.target.value as 'png')}
                                    />
                                    PNG
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                                    <input
                                        type="radio"
                                        value="jpg"
                                        checked={imageFormat === 'jpg'}
                                        onChange={(e) => setImageFormat(e.target.value as 'jpg')}
                                    />
                                    JPG
                                </label>
                            </div>
                        </div>
                    )}

                    {/* 檔案上傳 */}
                    <div
                        style={{
                            border: '2px dashed var(--border-primary)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--spacing-xl)',
                            textAlign: 'center',
                            marginBottom: 'var(--spacing-lg)',
                        }}
                    >
                        <Upload size={48} style={{ color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }} />
                        <p style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                            {t('upload.dragDrop')}
                        </p>
                        <input
                            type="file"
                            multiple={conversionType !== 'pdfToImage' && conversionType !== 'split'}
                            accept={conversionType === 'imageToPdf' ? 'image/*' : '.pdf'}
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                            id="converter-file-input"
                        />
                        <label
                            htmlFor="converter-file-input"
                            style={{
                                display: 'inline-block',
                                padding: 'var(--spacing-sm) var(--spacing-lg)',
                                background: 'var(--color-primary)',
                                color: 'white',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontWeight: 500,
                            }}
                        >
                            {t('upload.browse')}
                        </label>
                    </div>

                    {/* 選中的檔案 */}
                    {selectedFiles.length > 0 && (
                        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                            <p style={{ fontWeight: 500, marginBottom: 'var(--spacing-sm)' }}>
                                已選擇 {selectedFiles.length} 個檔案:
                            </p>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                {selectedFiles.map((file, index) => (
                                    <li
                                        key={index}
                                        style={{
                                            padding: 'var(--spacing-xs)',
                                            color: 'var(--text-secondary)',
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        {file.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* 轉換按鈕 */}
                    <button
                        onClick={handleConvert}
                        disabled={selectedFiles.length === 0}
                        style={{
                            width: '100%',
                            padding: 'var(--spacing-md)',
                            background: 'var(--gradient-primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: selectedFiles.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: selectedFiles.length === 0 ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 'var(--spacing-sm)',
                        }}
                    >
                        <Download size={20} />
                        {t('converter.convert')}
                    </button>
                </div>
            </div>
        </>
    );
};
