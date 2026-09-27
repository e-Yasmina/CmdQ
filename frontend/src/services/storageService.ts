import { API_BASE_URL } from '../config/apiConfig';

export const storageService = {
    getItems: async (key) => {
        const res = await fetch(`${API_BASE_URL}/storage/${key}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `Failed to fetch ${key}`);
        return data.data;
    },

    saveItem: async (key, item) => {
        const res = await fetch(`${API_BASE_URL}/storage/${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `Failed to save ${key}`);
        return data;
    },

    deleteItem: async (key, itemId) => {
        const res = await fetch(`${API_BASE_URL}/storage/${key}/${itemId}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `Failed to delete ${key}`);
        return data;
    }
};
