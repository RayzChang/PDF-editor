# PDF 編輯器 - 程式碼檢閱報告

**檢閱日期**: 2026-02-12  
**版本**: v1.0.0

---

## ✅ 功能邏輯檢查

### 1. 核心功能狀態

| 功能模組 | 狀態 | 備註 |
|---------|------|------|
| PDF 載入/渲染 | ✅ 正常 | PDF.js 整合良好，支援旋轉 |
| 文字編輯（原生點擊） | ✅ 正常 | 白底/紅底邏輯正確，底對齊已實作 |
| 文字/圖片旋轉 | ✅ 正常 | 匯出時自動配合頁面方向 |
| 繪圖/形狀/高亮 | ✅ 正常 | 基本功能完整 |
| 頁面管理 | ✅ 正常 | 旋轉/刪除/排序邏輯正確 |
| 撤銷/重做 | ✅ 正常 | 歷史記錄機制健全 |
| 格式轉換 | ✅ 正常 | PDF↔圖片、合併、分割 |
| 多語言 | ✅ 正常 | i18next 整合完整 |
| 主題切換 | ✅ 正常 | 深/淺色主題 |

### 2. 資料流與狀態管理

- ✅ **Zustand store** 結構清晰，狀態分離良好
- ✅ **座標轉換** (`coordinate-utils.ts`) 邏輯正確，支援旋轉
- ✅ **匯出邏輯** (`pdf-editor.ts`) 白底/文字/圖片處理一致
- ✅ **歷史記錄** 實作正確，支援 undo/redo

---

## ⚠️ 發現的問題與建議

### 🔴 高優先級

#### 1. **歷史記錄未在 `updateAnnotation` 中更新**
**位置**: `src/store/editor-store.ts:250-257`

```typescript
updateAnnotation: (id, data) => {
    const { annotations } = get();
    set({
        annotations: annotations.map(a =>
            a.id === id ? { ...a, data: { ...a.data, ...data } } : a
        ),
    });
},
```

**問題**: 修改標註時未加入歷史記錄，導致 undo/redo 無法還原修改。

**建議修復**:
```typescript
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
```

#### 2. **字型載入路徑不一致**
**位置**: `src/lib/pdf-editor.ts:58-59`

```typescript
const res = await fetch('./fonts/NotoSansTC-VariableFont_wght.ttf', { cache: 'force-cache' });
```

**問題**: 
- 開發環境用 `./fonts/`，但 `public/fonts/` 在 build 後會變成 `/fonts/`
- 已有多重備案，但可統一使用 `/fonts/`（Vite 會自動處理 public 路徑）

**建議**: 統一使用 `/fonts/NotoSansTC-VariableFont_wght.ttf`（Vite 會自動映射 public）

#### 3. **開發環境 console.log 未清理**
**位置**: 多處檔案

**問題**: 生產環境仍可能輸出 debug 訊息（雖然有 `import.meta.env.DEV` 檢查，但部分未檢查）

**建議**: 
- 統一使用 `if (import.meta.env.DEV) console.log(...)` 或
- 建立 `utils/logger.ts` 統一管理日誌

### 🟡 中優先級

#### 4. **錯誤處理可加強**
**位置**: `src/components/Editor/Toolbar.tsx:94-96`

```typescript
} catch (error) {
    console.error('儲存失敗:', error);
    setError('儲存失敗');
}
```

**問題**: 錯誤訊息未顯示詳細原因，使用者難以除錯。

**建議**: 
```typescript
} catch (error) {
    console.error('儲存失敗:', error);
    const message = error instanceof Error ? error.message : '儲存失敗';
    setError(`儲存失敗: ${message}`);
}
```

#### 5. **記憶體管理**
**位置**: `src/components/Editor/PDFViewer.tsx`

**問題**: 
- 圖片快取 (`imageCache`) 無上限，大量圖片可能造成記憶體問題
- PDF.js 渲染任務取消機制已實作，但可加強

**建議**: 
- 圖片快取加入 LRU 或數量上限（例如最多 50 張）
- 頁面切換時清理非當前頁的圖片快取

#### 6. **型別安全**
**位置**: `src/store/editor-store.ts:27`

```typescript
data: any;
```

**問題**: `Annotation.data` 使用 `any`，失去型別檢查。

**建議**: 定義具體型別：
```typescript
export interface TextAnnotationData {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color?: string;
    fontFamily?: string;
    isNativeEdit?: boolean;
    nativeEditOrigin?: { x: number; y: number; width: number; height: number };
    // ...
}

export interface Annotation {
    id: string;
    type: Tool;
    pageId: string;
    data: TextAnnotationData | DrawAnnotationData | ShapeAnnotationData | ...;
    timestamp: number;
}
```

### 🟢 低優先級

#### 7. **效能優化**
- **縮圖生成**: 目前每次切換頁面都重新生成，可加入快取
- **大型 PDF**: 未實作虛擬滾動或分頁載入，超大檔案可能卡頓
- **Canvas 重繪**: 可加入 `requestAnimationFrame` 節流

#### 8. **使用者體驗**
- **拖放上傳**: README 提到「規劃中」，可優先實作（體驗提升明顯）
- **鍵盤快捷鍵**: `useKeyboardShortcuts.ts` 已存在，但可擴充更多快捷鍵
- **進度提示**: 大型 PDF 載入/匯出時可顯示進度條

#### 9. **無障礙 (A11y)**
- 缺少 `aria-label`、`role` 等屬性
- 鍵盤導航可加強

---

## 💡 可新增功能建議

### 🎯 高價值功能

#### 1. **自動儲存 / 草稿恢復**
- 使用 `localStorage` 或 `IndexedDB` 儲存編輯狀態
- 關閉分頁後重新開啟可恢復編輯
- 實作難度: ⭐⭐

#### 2. **PDF 頁面預覽縮圖優化**
- 目前縮圖在側邊欄，可加入「縮圖視圖」模式（類似 PDF 閱讀器）
- 支援拖曳重新排序頁面（UI 已有 `movePage`，但缺少拖曳介面）
- 實作難度: ⭐⭐⭐

#### 3. **批次操作**
- 批次刪除/移動多頁
- 批次套用文字樣式
- 實作難度: ⭐⭐⭐

#### 4. **匯出選項**
- 選擇匯出範圍（特定頁面）
- 匯出品質設定（圖片解析度）
- 匯出格式選項（PDF/A、壓縮等級）
- 實作難度: ⭐⭐

### 🔧 實用工具

#### 5. **文字搜尋與取代**
- 在 PDF 中搜尋文字
- 批次取代功能
- 實作難度: ⭐⭐⭐⭐

#### 6. **註解匯出/匯入**
- 將標註匯出為 JSON，可重新匯入
- 方便協作或備份
- 實作難度: ⭐⭐

#### 7. **範本系統**
- 儲存常用標註組合為範本
- 快速套用（例如：簽名欄位、日期欄位）
- 實作難度: ⭐⭐⭐

#### 8. **PDF 表單填寫**
- 偵測 PDF 表單欄位（Widget Annotations）
- 提供表單填寫模式
- 實作難度: ⭐⭐⭐⭐

### 🎨 介面增強

#### 9. **縮放預覽**
- 滑鼠懸停時顯示局部放大預覽
- 實作難度: ⭐⭐

#### 10. **多選工具**
- 框選多個標註進行批次操作
- 實作難度: ⭐⭐⭐

#### 11. **圖層管理**
- 顯示標註圖層列表
- 可隱藏/鎖定/重新排序圖層
- 實作難度: ⭐⭐⭐⭐

---

## 📊 程式碼品質評估

| 項目 | 評分 | 說明 |
|------|------|------|
| **架構設計** | ⭐⭐⭐⭐⭐ | 模組化良好，職責分離清楚 |
| **型別安全** | ⭐⭐⭐ | 大部分有型別，但 `any` 使用過多 |
| **錯誤處理** | ⭐⭐⭐ | 基本覆蓋，但錯誤訊息可更詳細 |
| **效能** | ⭐⭐⭐⭐ | 整體良好，大型檔案可優化 |
| **可維護性** | ⭐⭐⭐⭐⭐ | 程式碼清晰，註解充足 |
| **測試覆蓋** | ⭐ | 缺少單元測試 |

---

## 🎯 優先改進建議（Top 5）

1. **修復 `updateAnnotation` 歷史記錄問題**（影響 undo/redo）
2. **統一字型載入路徑**（避免路徑問題）
3. **實作拖放上傳**（使用者體驗提升）
4. **加入型別定義**（提升型別安全）
5. **實作自動儲存/恢復**（實用性高）

---

## 📝 總結

整體而言，專案架構良好，核心功能完整且運作正常。主要問題集中在：
- 歷史記錄機制的小缺陷
- 型別安全可加強
- 使用者體驗細節可優化

建議優先修復歷史記錄問題，然後逐步加入上述高價值功能，可大幅提升產品競爭力。
