import { API_BASE_URL } from '../config/apiConfig';

export const storageService = {
    getItems: async (key: string) => {
        if (window.electronAPI?.getStorage) {
            const res = await window.electronAPI.getStorage(key);
            if (!res.ok) throw new Error(res.data?.detail || res.data?.message || `Failed to fetch ${key}`);
            return res.data?.data;
        }
        const res = await fetch(`${API_BASE_URL}/storage/${key}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `Failed to fetch ${key}`);
        return data.data;
    },

    saveItem: async (key: string, item: any) => {
        if (window.electronAPI?.saveStorage) {
            const res = await window.electronAPI.saveStorage(key, item);
            if (!res.ok) throw new Error(res.data?.detail || res.data?.message || `Failed to save ${key}`);
            return res.data;
        }
        const res = await fetch(`${API_BASE_URL}/storage/${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `Failed to save ${key}`);
        return data;
    },

    deleteItem: async (key: string, itemId: string) => {
        if (window.electronAPI?.deleteStorage) {
            const res = await window.electronAPI.deleteStorage(key, itemId);
            if (!res.ok) throw new Error(res.data?.detail || res.data?.message || `Failed to delete ${key}`);
            return res.data;
        }
        const res = await fetch(`${API_BASE_URL}/storage/${key}/${itemId}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `Failed to delete ${key}`);
        return data;
    }
};
