import { API_BASE_URL } from '../config/apiConfig';

export const apiService = {
    checkPort: async (host, port) => {
        const res = await fetch(`${API_BASE_URL}/check_port`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ host, port })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Port check failed");
        return data;
    },

    connectDb: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/databases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Connection failed");
        return data;
    },

    fetchSchema: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/schema`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Schema fetch failed");
        return data;
    },

    fetchClis: async () => {
        const res = await fetch(`${API_BASE_URL}/ai/detect_cli`);
        const data = await res.json();
        if (!res.ok) throw new Error("Failed to fetch CLIs");
        return data;
    },

    registerApiCli: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/ai/register_api_model`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Registration failed");
        return data;
    },

    launchAiPrompt: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/ai/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Execution failed");
        return data;
    },

    executeQuery: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Query failed");
        return data;
    },

    fetchTableData: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/table_data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to fetch table data");
        return data;
    }
};
