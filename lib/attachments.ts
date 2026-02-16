// ==========================================
// IndexedDB ベースの添付ファイル管理
// 見積書等の画像をブラウザ内に保存
// ==========================================

const DB_NAME = "budget_app_attachments";
const DB_VERSION = 1;
const STORE_NAME = "files";

export interface AttachmentMeta {
    id: string;
    transactionId: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: string;
}

export interface AttachmentRecord extends AttachmentMeta {
    data: ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("transactionId", "transactionId", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 添付ファイルを保存
 */
export async function saveAttachment(record: AttachmentRecord): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * 取引IDに紐づく添付ファイルのメタ情報一覧を取得
 */
export async function getAttachmentsByTransaction(transactionId: string): Promise<AttachmentMeta[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const index = tx.objectStore(STORE_NAME).index("transactionId");
        const request = index.getAll(transactionId);
        request.onsuccess = () => {
            const results: AttachmentMeta[] = (request.result as AttachmentRecord[]).map((r) => ({
                id: r.id,
                transactionId: r.transactionId,
                fileName: r.fileName,
                mimeType: r.mimeType,
                size: r.size,
                createdAt: r.createdAt,
            }));
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * 添付ファイルのデータを取得（プレビュー用）
 */
export async function getAttachment(id: string): Promise<AttachmentRecord | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 添付ファイルを削除
 */
export async function deleteAttachment(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * 取引IDに紐づく添付ファイルを全て削除
 */
export async function deleteAttachmentsByTransaction(transactionId: string): Promise<void> {
    const metas = await getAttachmentsByTransaction(transactionId);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        metas.forEach((m) => store.delete(m.id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * File → ArrayBuffer 変換
 */
export function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * ArrayBuffer → Object URL 変換（プレビュー用）
 */
export function arrayBufferToUrl(buffer: ArrayBuffer, mimeType: string): string {
    const blob = new Blob([buffer], { type: mimeType });
    return URL.createObjectURL(blob);
}

/**
 * ファイルサイズのフォーマット
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
