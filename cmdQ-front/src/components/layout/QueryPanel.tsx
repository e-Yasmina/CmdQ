import QueryEditor from '../QueryEditor';

export default function QueryPanel({
  topPanelHeight, startResizingTopPanel, sqlQuery, isQueryExecuting,
  setSqlQuery, executeManualQuery, handleSaveQuery, theme = 'dark',
}) {
  return (
    <div
      style={{ height: `${topPanelHeight}px` }}
      className="border-b border-border flex flex-col bg-panel flex-shrink-0 min-h-[150px] relative"
    >
      <div
        className="h-1 cursor-row-resize hover:bg-primary/50 transition-colors z-[60] absolute left-0 right-0 bottom-0"
        onMouseDown={startResizingTopPanel}
      />
      <QueryEditor
        value={sqlQuery}
        onChange={setSqlQuery}
        onExecuteQuery={executeManualQuery}
        onSaveQuery={handleSaveQuery}
        isLoading={isQueryExecuting}
        theme={theme}
      />
    </div>
  );
}
