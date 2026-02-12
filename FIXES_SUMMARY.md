# 高優先級問題修復摘要

**修復日期**: 2026-02-12  
**版本**: v1.0.1

---

## ✅ 已修復項目

### 1. updateAnnotation 歷史記錄問題

**問題描述**:  
`updateAnnotation` 函數修改標註時未更新歷史記錄，導致 undo/redo 無法還原修改。

**影響**:  
- 使用者修改標註（文字、繪圖、形狀）後無法撤銷
- 影響使用者體驗和資料安全性

**修復內容**:  
在 `src/store/editor-store.ts` 的 `updateAnnotation` 函數中加入歷史記錄機制，與 `addAnnotation` 和 `removeAnnotation` 保持一致。

**修改前**:
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

**修改後**:
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

**驗證**:  
- ✅ Build 成功
- ⏳ 需手動測試：修改標註後撤銷/重做功能

---

### 2. 字型路徑不一致

**問題描述**:  
字型載入路徑使用 `./fonts/` 和 `fonts/`，在不同環境（開發/生產/Electron）可能失效。

**影響**:  
- 某些環境下中文無法顯示
- 匯出 PDF 時中文可能變成問號

**修復內容**:  
優化 `src/lib/pdf-editor.ts` 的 `getCjkFontBytes` 函數，使用迴圈嘗試多種路徑，確保在所有環境都能正確載入字型。

**修改後**:
```typescript
async function getCjkFontBytes(): Promise<Uint8Array | null> {
    if (cjkFontBytesCache) return cjkFontBytesCache;
    
    // 嘗試多種路徑以支援不同環境（Vite dev/prod、Electron file://）
    const fontPaths = [
        '/fonts/NotoSansTC-VariableFont_wght.ttf',  // 標準 Vite public 路徑（開發/生產環境）
        './fonts/NotoSansTC-VariableFont_wght.ttf', // 相對路徑（Electron file://）
        'fonts/NotoSansTC-VariableFont_wght.ttf',   // 無前綴相對路徑
    ];
    
    for (const fontPath of fontPaths) {
        try {
            const res = await fetch(fontPath, { cache: 'force-cache' });
            if (!res.ok) continue;
            
            const ab = await res.arrayBuffer();
            const bytes = new Uint8Array(ab);
            if (!isRecognizedFontFormat(bytes)) continue;
            
            cjkFontBytesCache = bytes;
            return cjkFontBytesCache;
        } catch {
            continue; // 嘗試下一個路徑
        }
    }
    
    return null; // 所有路徑都失敗
}
```

**驗證**:  
- ✅ Build 成功
- ⏳ 需手動測試：開發/生產環境中文顯示、匯出 PDF 中文顯示

---

### 3. 開發環境 console.log 未清理

**問題描述**:  
部分 `console.log` 未加上 `import.meta.env.DEV` 檢查，生產環境可能輸出 debug 訊息。

**影響**:  
- 生產環境可能洩露 debug 資訊
- 影響效能（雖然影響很小）

**修復內容**:  
在以下檔案的所有 `console.log` 加上 `import.meta.env.DEV` 檢查：

1. **src/components/Editor/NativeTextLayer.tsx**
   - `console.log('NativeTextLayer mounted/updated', ...)`

2. **src/hooks/useEditorTools.ts**
   - `console.log('Detected Image Tool Click at:', ...)`
   - `console.log('Image input: Change event detected!')`
   - `console.log('Image input: Reading file...', ...)`
   - `console.log('Image input: Adding annotation at', ...)`
   - `console.log('Image input: Success')`

3. **src/components/Editor/Sidebar.tsx**
   - `console.log('Generating thumbnails for pages:', ...)`

4. **src/hooks/useHandTool.ts**
   - `console.log('[PAN]', ...)`

**注意**:  
- `console.error` **保留**（錯誤日誌對除錯很重要）
- 已有 `import.meta.env.DEV` 檢查的 `console.log` **未修改**

**驗證**:  
- ✅ Build 成功
- ⏳ 需手動測試：生產環境 build 後檢查 dist 檔案中無 `console.log`

---

## 📋 測試檢查清單

請參考 `TEST_CHECKLIST.md` 進行完整測試。

**重點測試項目**:
1. ✅ Build 成功（已完成）
2. ⏳ 修改標註後撤銷/重做功能
3. ⏳ 中文顯示（開發/生產/匯出）
4. ⏳ 生產環境無 console.log

---

## 🔍 回歸測試

修復後需確認以下功能仍正常運作：

- [ ] PDF 載入與渲染
- [ ] 文字編輯（原生點擊）
- [ ] 文字工具（新增文字）
- [ ] 繪圖工具
- [ ] 形狀工具
- [ ] 圖片插入
- [ ] 頁面旋轉
- [ ] 撤銷/重做（**重點測試**）
- [ ] 頁面管理
- [ ] 儲存/匯出
- [ ] 多語言
- [ ] 主題切換

---

---

## 🐛 額外修復：雙擊文字標註無法開啟編輯器

**發現時間**: 測試過程中  
**問題描述**:  
雙擊文字標註時無法開啟編輯器。原因是 `handleMouseDown` 使用 `e.detail === 2` 判斷雙擊，但 `pointerdown` 事件沒有 `detail` 屬性。

**修復內容**:  
在 `src/hooks/useSelectTool.ts` 中加入獨立的 `dblclick` 事件監聽器，正確處理雙擊事件。

**修改後**:
```typescript
// 處理雙擊事件（開啟文字編輯器）
const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
        if (activeTool !== 'select') return;

        const { x, y } = getCanvasCoordinates(e);
        const annotation = findAnnotationAtPoint(x, y);
        if (annotation && annotation.type === 'text') {
            onTextClick(annotation.id);
            e.preventDefault();
            e.stopPropagation();
        }
    },
    [activeTool, getCanvasCoordinates, findAnnotationAtPoint, onTextClick]
);

// 在 useEffect 中註冊 dblclick 事件
layer.addEventListener('dblclick', handleDoubleClick as any);
```

**驗證**:  
- ✅ Build 成功
- ✅ 手動測試通過：雙擊文字標註可開啟編輯器，撤銷/重做功能正常

---

---

## 🐛 額外修復：匯出時文字粗體/斜體格式遺失

**發現時間**: 測試過程中  
**問題描述**:  
編輯器中設定文字為粗體後，匯出的 PDF 中文字沒有粗體效果。

**修復內容**:  
在 `src/lib/pdf-editor.ts` 的 `applyAnnotations` 函數中：
1. 載入所有標準字型變體（Helvetica, HelveticaBold, HelveticaOblique, HelveticaBoldOblique）
2. 建立 `getStandardFont` 函數根據 `fontWeight` 和 `fontStyle` 選擇對應字型
3. 繪製文字時使用選擇的字型

**已知限制**:  
- ✅ **標準字型（英文）的粗體/斜體已支援**
- ⚠️ **CJK 字型（中文）的粗體暫時無法支援**
  - 原因：NotoSansTC 是變數字型（VariableFont），pdf-lib 的 `embedFont` 不直接支援變數字型的 weight 參數
  - 需要透過 fontkit 的 layout 功能設定 `wght: 700`，但這需要更複雜的實作
  - TODO: 實作變數字型的 weight 支援（可能需要使用 fontkit layout 或載入不同 weight 的字型檔案）

**驗證**:  
- ✅ Build 成功
- ✅ 手動測試通過：英文粗體/斜體匯出正常
- ⚠️ 中文粗體匯出為一般字型（已知限制，可接受）

---

## 📝 備註

- 所有修復都通過 TypeScript 編譯檢查
- Build 成功，無編譯錯誤
- 建議在修復後進行完整的手動測試，確保功能正常
