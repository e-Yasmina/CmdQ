import { useState } from 'react';
import { apiService } from '../../services/apiService';

export default function ApiRegistrationForm({ onRegistered, onCancel, editModel, existingModels = [] }) {
    const [apiFormData, setApiFormData] = useState({
        id: editModel?.id || "",
        name: editModel?.name || "",
        provider: editModel?.provider || "openai",
        model: editModel?.model || "gpt-4o",
        base_url: editModel?.base_url || "",
        api_key: editModel?.api_key || ""
    });
    const [isLoading, setIsLoading] = useState(false);

    const handleApiFormChange = (e) => {
        setApiFormData({ ...apiFormData, [e.target.name]: e.target.value });
    };

    const registerApiCli = async () => {
        if (!apiFormData.name || !apiFormData.api_key || !apiFormData.model) {
            alert("Name, Model, and API Key are required.");
            return;
        }

        if (!editModel) {
            const trimmedName = apiFormData.name.trim().toLowerCase();
            const nameConflict = existingModels.find(m => m.name && m.name.trim().toLowerCase() === trimmedName);
            if (nameConflict) {
                alert(`An API model named "${apiFormData.name.trim()}" is already registered. Please choose a different display name.`);
                return;
            }
        }

        setIsLoading(true);
        try {
            const id = editModel ? editModel.id : `api_${Date.now()}`;
            const payload = { ...apiFormData, id };
            await apiService.registerApiCli(payload);
            onRegistered(id);
        } catch (err) {
            alert("Registration Error: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-panel border border-border rounded-lg shadow-2xl p-6 w-96 flex flex-col gap-4">
                <h2 className="text-xl font-bold text-primary flex justify-between items-center w-full">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🤖</span> {editModel ? "Edit API Model" : "Connect API Model"}
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-gray-500 hover:text-white cursor-pointer transition-colors p-1"
                        aria-label="Cancel"
                        title="Cancel"
                    >
                        ✕
                    </button>
                </h2>
                <p className="text-xs text-gray-400">
                    Connect directly to an AI model via its API without CLI dependencies.
                </p>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">Provider</label>
                    <select
                        name="provider" value={apiFormData.provider} onChange={handleApiFormChange}
                        className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                    >
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="custom_openai">Custom (OpenAI Compatible)</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">Display Name</label>
                    <input
                        type="text" name="name" value={apiFormData.name} onChange={handleApiFormChange}
                        placeholder="e.g. My GPT-4"
                        className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">Model</label>
                    <input
                        type="text" name="model" value={apiFormData.model} onChange={handleApiFormChange}
                        placeholder="e.g. gpt-4o or claude-sonnet-4"
                        className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                    />
                </div>

                {apiFormData.provider === "custom_openai" && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase">Base URL</label>
                        <input
                            type="text" name="base_url" value={apiFormData.base_url} onChange={handleApiFormChange}
                            placeholder="e.g. https://api.together.xyz/v1"
                            className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                        />
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase">API Key</label>
                    <input
                        type="password" name="api_key" value={apiFormData.api_key} onChange={handleApiFormChange}
                        placeholder="sk-..."
                        className="bg-background border border-border text-textPrimary rounded p-2 focus:border-primary outline-none text-sm"
                    />
                </div>

                <div className="flex gap-2 mt-2">
                    <button
                        onClick={onCancel}
                        className="bg-red-500/20 border border-red-500/50 text-red-400 font-bold py-2 px-4 rounded hover:bg-red-500/30 transition-all w-1/3 cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={registerApiCli}
                        disabled={isLoading}
                        className="bg-primary text-background font-bold py-2 px-4 rounded hover:brightness-110 disabled:opacity-50 transition-all flex-1 cursor-pointer"
                    >
                        {isLoading ? "Saving..." : editModel ? "Update Model" : "Connect Model"}
                    </button>
                </div>
            </div>
        </div>
    );
}
