import ScrollArea from '../ScrollArea';
import SecurityAnalysisViewer from '../SecurityAnalysisViewer';
import PerformanceAnalysisViewer from '../PerformanceAnalysisViewer';
import DataAnalysisViewer from '../DataAnalysisViewer';
import SummaryAnalysisViewer from '../SummaryAnalysisViewer';
import DataTable from '../DataTable';
import TableSummary from '../TableSummary';
import DatabaseSummary from '../DatabaseSummary';
import { CopyIcon } from '../icons/CopyIcon';

const ANALYSIS_TYPES = ['security_analysis', 'performance_analysis', 'data_analysis', 'summary_analysis'];

export default function ResultsPanel({
  sqlResult, activeConfig, activeSchemaName, activeTableName,
  currentAbortController, copyFeedback, activeDatabase, viewMode,
  selectedCli, customCliCommand,
  setShowImportDbModal, setShowExportDbModal, setShowMigrationModal,
  launchAiAnalysis, stopAi, handleTranslateView, handleCopyResults,
  setDiagnosisTarget, executeManualQuery, refreshTableData,
  setMutationHistory, setSqlResult,
}) {
  const effSchema = sqlResult?.targetSchema || activeSchemaName;
  const effTable = sqlResult?.targetTable || activeTableName;
  const showTableSummary = Boolean(
    activeConfig && effTable &&
    !sqlResult?.loading && !sqlResult?.error &&
    !ANALYSIS_TYPES.includes(sqlResult?.type)
  );
  const showDbSummary = Boolean(activeConfig && activeDatabase && !effTable && !sqlResult);

  return (
    <div className="flex-1 bg-background p-4 flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xs uppercase text-gray-500 font-bold tracking-wider mr-8">Results:</h2>
        {activeDatabase && (
          <div className="flex gap-2">
            <button
              onClick={() => launchAiAnalysis('security')}
              disabled={!!currentAbortController}
              className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >🔒 Security</button>
            <button
              onClick={() => launchAiAnalysis('performance')}
              disabled={!!currentAbortController}
              className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >⚡ Performance</button>
            <button
              onClick={() => launchAiAnalysis('data')}
              disabled={!!currentAbortController}
              className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >📊 Data Analysis</button>
            {/* <button
              onClick={() => launchAiAnalysis('summary')}
              disabled={!!currentAbortController}
              className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >📝 Summary</button> */}

            {currentAbortController && (
              <button
                onClick={stopAi}
                className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                title="Stop AI Operation"
              >■ STOP</button>
            )}

            <div className="h-4 w-px bg-border mx-1 self-center"></div>
            <button
              onClick={() => setShowImportDbModal(true)}
              disabled={!!currentAbortController}
              className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >📥 Import DB</button>
            <button
              onClick={() => setShowExportDbModal(true)}
              disabled={!!currentAbortController}
              className="bg-panel border border-border hover:bg-white/5 text-textPrimary px-2 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >📤 Export DB</button>
            <button
              onClick={() => setShowMigrationModal(true)}
              disabled={!!currentAbortController}
              className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary hover:text-background px-2 py-1 rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >🔄 ETL/Mapping</button>
            <div className="h-4 w-px bg-border mx-1 self-center"></div>
            <button
              onClick={handleTranslateView}
              disabled={!!currentAbortController || (!sqlResult?.data?.length)}
              className="bg-[#2a1b38] border border-[#d288ff]/50 text-[#e0a8ff] hover:bg-[#d288ff] hover:text-black px-2 py-1 rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
              title="Translate the current visible table data"
            >🌐 Translate View</button>
            <button
              onClick={handleCopyResults}
              disabled={!sqlResult || sqlResult.loading}
              className={`border p-1.5 rounded transition-all cursor-pointer flex items-center justify-center disabled:opacity-50 ${copyFeedback ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-panel border-border hover:bg-white/5 text-textPrimary'}`}
              title="Copy results (JSON or Text)"
            >
              {copyFeedback ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              ) : (
                <CopyIcon className={undefined} />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 rounded border border-border bg-panel overflow-hidden flex flex-col">
        <ScrollArea className="font-code text-sm overflow-y-auto flex-1 mb-2">
          {showDbSummary ? (
            <DatabaseSummary
              activeConfig={activeConfig}
              databaseName={activeDatabase}
              command={selectedCli === 'custom' ? customCliCommand : selectedCli}
            />
          ) : sqlResult?.type === 'security_analysis' ? (
            <SecurityAnalysisViewer result={sqlResult} />
          ) : sqlResult?.type === 'performance_analysis' ? (
            <PerformanceAnalysisViewer result={sqlResult} />
          ) : sqlResult?.type === 'data_analysis' ? (
            <DataAnalysisViewer result={sqlResult} />
          ) : sqlResult?.type === 'summary_analysis' ? (
            <SummaryAnalysisViewer result={sqlResult} />
          ) : (
            <DataTable
              result={sqlResult}
              activeConfig={activeConfig}
              activeSchemaName={sqlResult?.targetSchema || activeSchemaName}
              activeTableName={sqlResult?.targetTable || activeTableName}
              onDiagnose={(s, t) => setDiagnosisTarget({ schema: s, table: t })}
              onRefresh={() => {
                if (sqlResult?.extracted_sql && !sqlResult?.isTableClick) {
                  executeManualQuery(sqlResult.extracted_sql);
                } else {
                  refreshTableData();
                }
              }}
              onLocalMutation={(type, payload) => {
                setMutationHistory(prev => [...prev, JSON.parse(JSON.stringify(sqlResult))]);
                setSqlResult(prev => {
                  if (!prev || !prev.data) return prev;
                  const data = [...prev.data];
                  let original_data = prev.original_data ? [...prev.original_data] : null;

                  if (type === 'update') {
                    data[payload.rowIndex] = { ...data[payload.rowIndex], [payload.updateKey]: payload.updateValue };
                    if (original_data) {
                      const transKeys = Object.keys(data[payload.rowIndex]);
                      const origKeys = Object.keys(original_data[payload.rowIndex]);
                      const keyIdx = transKeys.indexOf(payload.updateKey);
                      const realKey = keyIdx !== -1 && origKeys[keyIdx] ? origKeys[keyIdx] : payload.updateKey;
                      original_data[payload.rowIndex] = { ...original_data[payload.rowIndex], [realKey]: payload.updateValue };
                    }
                  } else if (type === 'delete') {
                    const idx = data.indexOf(payload.row);
                    if (idx > -1) {
                      data.splice(idx, 1);
                      if (original_data) original_data.splice(idx, 1);
                    }
                  } else if (type === 'insert') {
                    data.unshift(payload.row);
                    if (original_data) {
                      const mockData = {};
                      const origKeys = Object.keys(original_data[0] || {});
                      const transKeys = Object.keys(payload.row);
                      for (let i = 0; i < transKeys.length; i++) {
                        let realKey = origKeys[i] ? origKeys[i] : transKeys[i];
                        mockData[realKey] = payload.row[transKeys[i]];
                      }
                      original_data.unshift(mockData);
                    }
                  }
                  return { ...prev, data, original_data };
                });
              }}
            />
          )}
        </ScrollArea>
      </div>

      {showTableSummary && (
        <TableSummary
          activeConfig={activeConfig}
          schemaName={effSchema}
          tableName={effTable}
          command={selectedCli === 'custom' ? customCliCommand : selectedCli}
        />
      )}
    </div>
  );
}
