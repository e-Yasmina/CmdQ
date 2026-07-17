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

    createDatabase: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/create_database`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to create database");
        return data;
    },

    dropDatabase: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/drop_database`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to drop database");
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

    fetchRegisteredModels: async () => {
        const res = await fetch(`${API_BASE_URL}/ai/registered_models`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to fetch registered models");
        return data;
    },

    deleteApiModel: async (modelId) => {
        const res = await fetch(`${API_BASE_URL}/ai/register_api_model/${modelId}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Delete failed");
        return data;
    },

    launchAiPrompt: async (payload, signal) => {
        const res = await fetch(`${API_BASE_URL}/ai/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: signal
        });
        const data = await res.json();
        if (!res.ok) {
            let errMsg = data.detail || "Execution failed";
            if (typeof errMsg === "object") {
                errMsg = JSON.stringify(errMsg);
            }
            throw new Error(errMsg);
        }
        return data;
    },

    executeQuery: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...payload,
                session_context: payload.session_context || []
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Query failed");
        if (data.status === "error") throw new Error(data.message || "Query failed");
        return data;
    },

    fetchTableData: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/table_data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...payload,
                session_context: payload.session_context || []
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to fetch table data");
        return data;
    },

    fetchSecurityAnalysis: async (payload, signal) => {
        const res = await fetch(`${API_BASE_URL}/analyze/security`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to fetch security analysis");
        return data;
    },

    fetchPerformanceAnalysis: async (payload, signal) => {
        const res = await fetch(`${API_BASE_URL}/analyze/performance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to fetch performance analysis");
        return data;
    },

    fetchDataAnalysis: async (payload, signal) => {
        const res = await fetch(`${API_BASE_URL}/analyze/data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to fetch data analysis");
        return data;
    },

    fetchSummaryAnalysis: async (payload, signal) => {
        const res = await fetch(`${API_BASE_URL}/analyze/summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to fetch summary analysis");
        return data;
    },

    exportTable: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/export/table`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || errData.message || "Failed to export table");
        }
        return await res.blob();
    },

    exportDatabase: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/export/database`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || errData.message || "Failed to export database");
        }
        return await res.blob();
    },

    importTable: async (formData) => {
        const res = await fetch(`${API_BASE_URL}/import/table`, {
            method: "POST",
            body: formData // No Content-Type header so browser sets multipart/form-data with boundary
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to import table");
        return data;
    },

    importDatabase: async (formData) => {
        const res = await fetch(`${API_BASE_URL}/import/database`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to import database");
        return data;
    },

    scanImport: async (formData) => {
        const res = await fetch(`${API_BASE_URL}/import/scan`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to scan import file");
        return data;
    },

    copyDatabase: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/database/copy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to copy database");
        return data;
    },

    migrateData: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/etl/migrate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to migrate data");
        return data;
    },
    
    launchDebugCli: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/ai/launch_debug`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to launch debug terminal");
        return data;
    },

    translateTable: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/ai/translate_table`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to translate table");
        return data;
    },

    fetchProtectionAnalysis: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/analyze/protection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to analyze protection");
        return data;
    },

    saveFile: async (payload) => {
        const res = await fetch(`${API_BASE_URL}/ai/save_file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to save file");
        return data;
    }
};
