import { API_BASE_URL } from '../config/apiConfig';

async function handleIpcCall(callPromise: Promise<any>, fallbackErrorMsg = "Request failed") {
    const res = await callPromise;
    if (!res || !res.ok) {
        let errMsg = (res && res.data && (res.data.detail || res.data.message || res.data.error)) || fallbackErrorMsg;
        if (typeof errMsg === 'object') {
            errMsg = JSON.stringify(errMsg);
        }
        throw new Error(errMsg);
    }
    return res.data;
}

async function convertFormDataToUploadPayload(formData: FormData) {
    const files: Record<string, { name: string; data: string; type: string }> = {};
    const body: Record<string, any> = {};

    for (const [key, val] of (formData as any).entries()) {
        if (val instanceof File || val instanceof Blob) {
            const file = val as File;
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Str = btoa(binary);
            files[key] = {
                name: file.name || 'uploaded_file',
                data: base64Str,
                type: file.type || 'application/octet-stream'
            };
        } else {
            body[key] = val;
        }
    }
    return { files, body };
}

function convertIpcExportToBlob(res: any, defaultType: string): Blob {
    if (!res || !res.ok) {
        const errMsg = (res && res.data && (res.data.detail || res.data.message)) || "Export failed";
        throw new Error(typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg);
    }
    const contentType = (res.headers && res.headers['content-type']) || defaultType;
    if (res.is_base64 && typeof res.data === 'string') {
        const byteCharacters = atob(res.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
    }
    return new Blob([typeof res.data === 'string' ? res.data : JSON.stringify(res.data)], { type: contentType });
}

export const apiService = {
    checkPort: async (host: string, port: number) => {
        if (window.electronAPI?.checkPort) {
            return handleIpcCall(window.electronAPI.checkPort(host, port), "Port check failed");
        }
        const res = await fetch(`${API_BASE_URL}/check_port`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ host, port })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Port check failed");
        return data;
    },

    connectDb: async (payload: any) => {
        if (window.electronAPI?.connectDb) {
            return handleIpcCall(window.electronAPI.connectDb(payload), "Connection failed");
        }
        const res = await fetch(`${API_BASE_URL}/databases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Connection failed");
        return data;
    },

    createDatabase: async (payload: any) => {
        if (window.electronAPI?.createDatabase) {
            return handleIpcCall(window.electronAPI.createDatabase(payload), "Failed to create database");
        }
        const res = await fetch(`${API_BASE_URL}/create_database`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to create database");
        return data;
    },

    dropDatabase: async (payload: any) => {
        if (window.electronAPI?.dropDatabase) {
            return handleIpcCall(window.electronAPI.dropDatabase(payload), "Failed to drop database");
        }
        const res = await fetch(`${API_BASE_URL}/drop_database`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to drop database");
        return data;
    },

    fetchSchema: async (payload: any) => {
        if (window.electronAPI?.fetchSchema) {
            return handleIpcCall(window.electronAPI.fetchSchema(payload), "Schema fetch failed");
        }
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
        if (window.electronAPI?.fetchClis) {
            return handleIpcCall(window.electronAPI.fetchClis(), "Failed to fetch CLIs");
        }
        const res = await fetch(`${API_BASE_URL}/ai/detect_cli`);
        const data = await res.json();
        if (!res.ok) throw new Error("Failed to fetch CLIs");
        return data;
    },

    registerApiCli: async (payload: any) => {
        if (window.electronAPI?.registerApiCli) {
            return handleIpcCall(window.electronAPI.registerApiCli(payload), "Registration failed");
        }
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
        if (window.electronAPI?.fetchRegisteredModels) {
            return handleIpcCall(window.electronAPI.fetchRegisteredModels(), "Failed to fetch registered models");
        }
        const res = await fetch(`${API_BASE_URL}/ai/registered_models`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to fetch registered models");
        return data;
    },

    deleteApiModel: async (modelId: string) => {
        if (window.electronAPI?.deleteApiModel) {
            return handleIpcCall(window.electronAPI.deleteApiModel(modelId), "Delete failed");
        }
        const res = await fetch(`${API_BASE_URL}/ai/register_api_model/${modelId}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Delete failed");
        return data;
    },

    launchAiPrompt: async (payload: any, signal?: AbortSignal) => {
        if (signal?.aborted) {
            throw new Error("Request aborted");
        }
        if (window.electronAPI?.launchAiPrompt) {
            return handleIpcCall(window.electronAPI.launchAiPrompt(payload), "Execution failed");
        }
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

    executeQuery: async (payload: any) => {
        const queryPayload = {
            ...payload,
            session_context: payload.session_context || []
        };
        if (window.electronAPI?.executeQuery) {
            const data = await handleIpcCall(window.electronAPI.executeQuery(queryPayload), "Query failed");
            if (data.status === "error") throw new Error(data.message || "Query failed");
            return data;
        }
        const res = await fetch(`${API_BASE_URL}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(queryPayload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Query failed");
        if (data.status === "error") throw new Error(data.message || "Query failed");
        return data;
    },

    fetchTableData: async (payload: any) => {
        const tablePayload = {
            ...payload,
            session_context: payload.session_context || []
        };
        if (window.electronAPI?.fetchTableData) {
            const data = await handleIpcCall(window.electronAPI.fetchTableData(tablePayload), "Failed to fetch table data");
            if (data.status === "error") throw new Error(data.message || "Failed to fetch table data");
            return data;
        }
        const res = await fetch(`${API_BASE_URL}/table_data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tablePayload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to fetch table data");
        return data;
    },

    fetchSecurityAnalysis: async (payload: any, signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error("Request aborted");
        if (window.electronAPI?.fetchSecurityAnalysis) {
            return handleIpcCall(window.electronAPI.fetchSecurityAnalysis(payload), "Failed to fetch security analysis");
        }
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

    fetchPerformanceAnalysis: async (payload: any, signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error("Request aborted");
        if (window.electronAPI?.fetchPerformanceAnalysis) {
            return handleIpcCall(window.electronAPI.fetchPerformanceAnalysis(payload), "Failed to fetch performance analysis");
        }
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

    fetchDataAnalysis: async (payload: any, signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error("Request aborted");
        if (window.electronAPI?.fetchDataAnalysis) {
            return handleIpcCall(window.electronAPI.fetchDataAnalysis(payload), "Failed to fetch data analysis");
        }
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

    fetchSummaryAnalysis: async (payload: any, signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error("Request aborted");
        if (window.electronAPI?.fetchSummaryAnalysis) {
            return handleIpcCall(window.electronAPI.fetchSummaryAnalysis(payload), "Failed to fetch summary analysis");
        }
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

    exportTable: async (payload: any): Promise<Blob> => {
        if (window.electronAPI?.exportTable) {
            const res = await window.electronAPI.exportTable(payload);
            return convertIpcExportToBlob(res, "text/csv");
        }
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

    exportDatabase: async (payload: any): Promise<Blob> => {
        if (window.electronAPI?.exportDatabase) {
            const res = await window.electronAPI.exportDatabase(payload);
            return convertIpcExportToBlob(res, "application/sql");
        }
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

    importTable: async (formData: FormData) => {
        if (window.electronAPI?.importTable) {
            const uploadPayload = await convertFormDataToUploadPayload(formData);
            return handleIpcCall(window.electronAPI.importTable(uploadPayload), "Failed to import table");
        }
        const res = await fetch(`${API_BASE_URL}/import/table`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to import table");
        return data;
    },

    importDatabase: async (formData: FormData) => {
        if (window.electronAPI?.importDatabase) {
            const uploadPayload = await convertFormDataToUploadPayload(formData);
            return handleIpcCall(window.electronAPI.importDatabase(uploadPayload), "Failed to import database");
        }
        const res = await fetch(`${API_BASE_URL}/import/database`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to import database");
        return data;
    },

    scanImport: async (formData: FormData) => {
        if (window.electronAPI?.scanImport) {
            const uploadPayload = await convertFormDataToUploadPayload(formData);
            return handleIpcCall(window.electronAPI.scanImport(uploadPayload), "Failed to scan import file");
        }
        const res = await fetch(`${API_BASE_URL}/import/scan`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to scan import file");
        return data;
    },

    copyDatabase: async (payload: any) => {
        if (window.electronAPI?.copyDatabase) {
            return handleIpcCall(window.electronAPI.copyDatabase(payload), "Failed to copy database");
        }
        const res = await fetch(`${API_BASE_URL}/database/copy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to copy database");
        return data;
    },

    migrateData: async (payload: any) => {
        if (window.electronAPI?.migrateData) {
            return handleIpcCall(window.electronAPI.migrateData(payload), "Failed to migrate data");
        }
        const res = await fetch(`${API_BASE_URL}/etl/migrate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to migrate data");
        return data;
    },

    launchDebugCli: async (payload: any) => {
        if (window.electronAPI?.launchDebugCli) {
            return handleIpcCall(window.electronAPI.launchDebugCli(payload), "Failed to launch debug terminal");
        }
        const res = await fetch(`${API_BASE_URL}/ai/launch_debug`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to launch debug terminal");
        return data;
    },

    translateTable: async (payload: any) => {
        if (window.electronAPI?.translateTable) {
            return handleIpcCall(window.electronAPI.translateTable(payload), "Failed to translate table");
        }
        const res = await fetch(`${API_BASE_URL}/ai/translate_table`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to translate table");
        return data;
    },

    fetchProtectionAnalysis: async (payload: any) => {
        if (window.electronAPI?.fetchProtectionAnalysis) {
            return handleIpcCall(window.electronAPI.fetchProtectionAnalysis(payload), "Failed to analyze protection");
        }
        const res = await fetch(`${API_BASE_URL}/analyze/protection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.message || "Failed to analyze protection");
        return data;
    },

    saveFile: async (payload: any) => {
        if (window.electronAPI?.saveFile) {
            return handleIpcCall(window.electronAPI.saveFile(payload), "Failed to save file");
        }
        const res = await fetch(`${API_BASE_URL}/ai/save_file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to save file");
        return data;
    },

    fetchProtectionRules: async (connectionId?: string) => {
        if (window.electronAPI?.fetchProtectionRules) {
            return handleIpcCall(window.electronAPI.fetchProtectionRules(connectionId), "Failed to fetch protection rules");
        }
        const url = connectionId
            ? `${API_BASE_URL}/protection?connection_id=${encodeURIComponent(connectionId)}`
            : `${API_BASE_URL}/protection`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to fetch protection rules");
        return data;
    },

    saveProtectionRule: async (payload: any) => {
        if (window.electronAPI?.saveProtectionRule) {
            return handleIpcCall(window.electronAPI.saveProtectionRule(payload), "Failed to save protection rule");
        }
        const res = await fetch(`${API_BASE_URL}/protection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to save protection rule");
        return data;
    },

    saveProtectionBulk: async (payload: any) => {
        if (window.electronAPI?.saveProtectionBulk) {
            return handleIpcCall(window.electronAPI.saveProtectionBulk(payload), "Failed to save protection rules");
        }
        const res = await fetch(`${API_BASE_URL}/protection/bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to save protection rules");
        return data;
    },

    deleteProtectionRule: async (ruleId: string) => {
        if (window.electronAPI?.deleteProtectionRule) {
            return handleIpcCall(window.electronAPI.deleteProtectionRule(ruleId), "Failed to delete protection rule");
        }
        const res = await fetch(`${API_BASE_URL}/protection/${encodeURIComponent(ruleId)}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to delete protection rule");
        return data;
    },

    fetchEntityGraph: async (payload: any) => {
        if (window.electronAPI?.fetchEntityGraph) {
            return handleIpcCall(window.electronAPI.fetchEntityGraph(payload), "Failed to fetch entity graph");
        }
        const res = await fetch(`${API_BASE_URL}/entity_graph`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to fetch entity graph");
        return data;
    }
};
