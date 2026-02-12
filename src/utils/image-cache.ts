/**
 * LRU (Least Recently Used) 圖片快取
 * 限制快取大小，自動清理最少使用的圖片
 */

export class LRUImageCache {
    private cache: Map<string, HTMLImageElement>;
    private accessOrder: string[]; // 記錄存取順序，最後存取的在最後
    private maxSize: number;

    constructor(maxSize: number = 50) {
        this.cache = new Map();
        this.accessOrder = [];
        this.maxSize = maxSize;
    }

    /**
     * 取得圖片，如果存在則更新存取順序
     */
    get(key: string): HTMLImageElement | undefined {
        if (this.cache.has(key)) {
            // 更新存取順序：移除舊位置，加入最後
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
            this.accessOrder.push(key);
            return this.cache.get(key);
        }
        return undefined;
    }

    /**
     * 設定圖片，如果超過大小限制則移除最少使用的
     */
    set(key: string, value: HTMLImageElement): void {
        if (this.cache.has(key)) {
            // 已存在，更新存取順序
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
            this.accessOrder.push(key);
            this.cache.set(key, value);
        } else {
            // 新圖片，檢查是否需要清理
            if (this.cache.size >= this.maxSize) {
                // 移除最少使用的（第一個）
                const oldestKey = this.accessOrder.shift();
                if (oldestKey) {
                    this.cache.delete(oldestKey);
                }
            }
            this.cache.set(key, value);
            this.accessOrder.push(key);
        }
    }

    /**
     * 刪除指定圖片
     */
    delete(key: string): boolean {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        return this.cache.delete(key);
    }

    /**
     * 清理所有快取
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
    }

    /**
     * 清理指定頁面的圖片（根據 annotation ID 前綴或 pageId）
     */
    clearByPage(pageId: string, annotations: Array<{ id: string; pageId: string }>): void {
        const pageAnnotationIds = annotations
            .filter(ann => ann.pageId === pageId)
            .map(ann => ann.id);
        
        // 只保留當前頁面的圖片，刪除其他頁面的圖片
        const keysToDelete: string[] = [];
        this.cache.forEach((_, key) => {
            if (!pageAnnotationIds.includes(key)) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => this.delete(key));
    }

    /**
     * 取得當前快取大小
     */
    size(): number {
        return this.cache.size;
    }
}
