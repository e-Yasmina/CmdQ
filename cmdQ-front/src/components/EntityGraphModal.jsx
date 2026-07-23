import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Handle,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { apiService } from '../services/apiService';
import { PALETTE } from '../theme/palette';

const NODE_WIDTH = 240;
const COMPACT_NODE_WIDTH = 140;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 36;
const COMPACT_HEIGHT = 40;
const PADDING = 12;

function isColumnsVisible(node) {
  const s = node.data?.settings;
  return s && (s.showColumns || s.showPk || s.showFk || s.showNotNull || s.showEnums || s.showTypes);
}

function calcNodeHeight(node) {
  if (!isColumnsVisible(node)) return COMPACT_HEIGHT;
  const colCount = node.columns?.length || 0;
  return HEADER_HEIGHT + PADDING + colCount * ROW_HEIGHT + (colCount > 0 ? PADDING : 0);
}

function getLayoutedElements(nodes, edges, direction = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 });

  nodes.forEach((n) => {
    const h = calcNodeHeight(n);
    const w = isColumnsVisible(n) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
    g.setNode(n.id, { width: w, height: h });
  });

  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((n) => {
    const pos = g.node(n.id);
    const h = calcNodeHeight(n);
    const w = isColumnsVisible(n) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
    return {
      ...n,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
      data: { ...n.data },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function TableNode({ data }) {
  const { table, schema, columns, settings } = data;
  const nodeHeight = calcNodeHeight(data);
  const displayCols = columns || [];
  const compact = !isColumnsVisible({ data: { settings }, columns });

  return (
    <div
      className="rounded-lg overflow-hidden border shadow-lg"
      style={{
        width: compact ? COMPACT_NODE_WIDTH : NODE_WIDTH,
        minHeight: nodeHeight,
        backgroundColor: PALETTE.panel,
        borderColor: PALETTE.border,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: PALETTE.primary, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: PALETTE.primary, width: 8, height: 8 }} />
      {compact ? (
        <div
          className="px-3 flex items-center justify-center"
          style={{ height: COMPACT_HEIGHT, backgroundColor: PALETTE.primary + '12' }}
        >
          <span className="text-xs font-bold truncate text-center" style={{ color: PALETTE.textPrimary }}>{table}</span>
        </div>
      ) : (
        <>
          <div
            className="px-3 py-2 flex items-center gap-2"
            style={{ backgroundColor: PALETTE.primary + '18', borderBottom: `1px solid ${PALETTE.border}` }}
          >
            <span className="text-[10px] opacity-50" style={{ color: PALETTE.secondary }}>{schema}.</span>
            <span className="text-xs font-bold truncate" style={{ color: PALETTE.textPrimary }}>{table}</span>
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: PALETTE.border, color: PALETTE.secondary }}>
              {displayCols.length}
            </span>
          </div>
          {settings.showColumns && displayCols.length > 0 && (
            <div className="px-2 py-1.5">
              {displayCols.map((col) => (
                <div
                  key={col.name}
                  className="flex items-center gap-1.5 py-px"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="w-3 text-center flex-shrink-0 text-[9px]">
                    {col.is_pk ? (
                      <span title="Primary Key">&#x1f511;</span>
                    ) : col.is_fk ? (
                      <span title="Foreign Key" style={{ color: PALETTE.chartBlue }}>&#x1f517;</span>
                    ) : col.not_null ? (
                      <span title="NOT NULL" style={{ color: PALETTE.chartAmber }}>&#x25C6;</span>
                    ) : (
                      <span title="nullable" style={{ color: PALETTE.border }}>&#x25C7;</span>
                    )}
                  </span>
                  <span className="text-[11px] truncate flex-1" style={{ color: PALETTE.textPrimary }}>
                    {col.name}
                  </span>
                  {settings.showTypes && col.type && (
                    <span className="text-[9px] truncate max-w-[80px] ml-auto" style={{ color: PALETTE.secondary }}>
                      {col.type}
                    </span>
                  )}
                  {settings.showNotNull && col.not_null && !col.is_pk && (
                    <span className="text-[8px] px-0.5 rounded" style={{ color: PALETTE.chartAmber, backgroundColor: PALETTE.chartAmber + '15' }}>NN</span>
                  )}
                  {col.enum_values && col.enum_values.length > 0 && settings.showEnums && (
                    <span className="text-[8px] px-1 rounded-full" style={{ color: PALETTE.chartViolet, backgroundColor: PALETTE.chartViolet + '15' }}>
                      E
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const nodeTypes = { tableNode: TableNode };

export default function EntityGraphModal({ activeConfig, targetDatabase, targetSchema, onClose }) {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(true);
  const [settings, setSettings] = useState({
    showColumns: true,
    showTypes: true,
    showPk: true,
    showFk: true,
    showNotNull: true,
    showEnums: true,
    schemaFilter: '',
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);

  const fetchGraph = useCallback(async () => {
    if (!activeConfig) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        db_config: activeConfig,
        schema_name: targetSchema || settings.schemaFilter || '',
        include_columns: settings.showColumns,
        include_column_types: settings.showTypes,
        include_pk: settings.showPk,
        include_fk: settings.showFk,
        include_not_null: settings.showNotNull,
        include_enums: settings.showEnums,
      };
      const res = await apiService.fetchEntityGraph(payload);
      console.log('[ENTITY_GRAPH DEBUG] API response:', {
        status: res.status,
        nodes: res.graph?.nodes?.length ?? 0,
        edges: res.graph?.edges?.length ?? 0,
        totalTables: res.graph?.total_tables,
        truncated: res.graph?.truncated,
      });
      if (res.graph?.edges?.length > 0) {
        console.log('[ENTITY_GRAPH DEBUG] Sample edges:', res.graph.edges.slice(0, 5));
      } else {
        console.log('[ENTITY_GRAPH DEBUG] NO EDGES in response from backend');
      }
      if (res.status === 'success') {
        setGraphData(res.graph);
      } else {
        setError(res.message || 'Failed to generate graph');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeConfig, targetSchema, settings]);

  useEffect(() => {
    fetchGraph();
  }, []);

  const layouted = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };

    const rfNodes = graphData.nodes.map((n) => ({
      id: n.id,
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: {
        table: n.table,
        schema: n.schema,
        columns: n.columns,
        settings: {
          showColumns: settings.showColumns,
          showTypes: settings.showTypes,
          showPk: settings.showPk,
          showFk: settings.showFk,
          showNotNull: settings.showNotNull,
          showEnums: settings.showEnums,
        },
      },
    }));

    const rfEdges = graphData.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: `${e.source_column} \u2192 ${e.target_column}`,
      labelStyle: { fill: PALETTE.secondary, fontWeight: 500, fontSize: 10 },
      labelBgStyle: { fill: PALETTE.panel, fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      type: 'smoothstep',
      animated: true,
      style: { stroke: PALETTE.secondary, strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: PALETTE.secondary,
        width: 16,
        height: 16,
      },
    }));

    const result = getLayoutedElements(rfNodes, rfEdges);
    console.log('[ENTITY_GRAPH DEBUG] Layout complete:', {
      inputNodes: rfNodes.length,
      inputEdges: rfEdges.length,
      outputNodes: result.nodes.length,
      outputEdges: result.edges.length,
    });
    return result;
  }, [graphData, settings]);

  useEffect(() => {
    console.log('[ENTITY_GRAPH DEBUG] Setting RF state:', {
      nodes: layouted.nodes.length,
      edges: layouted.edges.length,
      nodeIds: layouted.nodes.slice(0, 3).map(n => n.id),
      edgeSrcTgt: layouted.edges.slice(0, 3).map(e => `${e.source}->${e.target}`),
    });
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const handleFitView = useCallback(() => {
    if (rfInstance) {
      rfInstance.fitView({ padding: 0.2, duration: 300 });
    }
  }, [rfInstance]);

  const handleExportPng = useCallback(async () => {
    if (!rfInstance) return;
    try {
      const { toPng } = await import('reactflow');
      const dataUrl = await toPng(document.querySelector('.react-flow'), {
        backgroundColor: PALETTE.background,
        quality: 1,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `entity_graph_${targetDatabase || 'db'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [rfInstance, targetDatabase]);

  const toggleSetting = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const uniqueSchemas = useMemo(() => {
    if (!graphData) return [];
    const schemas = new Set(graphData.nodes.map((n) => n.schema));
    return Array.from(schemas).sort();
  }, [graphData]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: PALETTE.background }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: PALETTE.border, backgroundColor: PALETTE.panel }}>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold" style={{ color: PALETTE.primary }}>
            Entity Relationship Graph
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: PALETTE.border, color: PALETTE.secondary }}>
            {targetDatabase || 'Database'}
          </span>
          {graphData?.truncated && (
            <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: PALETTE.chartAmber + '20', color: PALETTE.chartAmber }}>
              Showing first {graphData.nodes.length} of {graphData.total_tables} tables
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFitView}
            className="px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer border"
            style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary, backgroundColor: PALETTE.background }}
            title="Fit to view"
          >&#x29C9; Fit View</button>
          <button
            onClick={handleExportPng}
            className="px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer border"
            style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary, backgroundColor: PALETTE.background }}
            title="Export as PNG"
          >&#x2B07; Export PNG</button>
          <button
            onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
            className="px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer border"
            style={{
              borderColor: settingsPanelOpen ? PALETTE.primary : PALETTE.border,
              color: settingsPanelOpen ? PALETTE.primary : PALETTE.textPrimary,
              backgroundColor: settingsPanelOpen ? PALETTE.primary + '15' : PALETTE.background,
            }}
          >&#x2699; Settings</button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded transition-colors cursor-pointer hover:bg-white/10"
            style={{ color: PALETTE.textPrimary }}
          >&#x2715;</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Settings Panel */}
        {settingsPanelOpen && (
          <div
            className="w-56 flex-shrink-0 border-r p-3 overflow-y-auto"
            style={{ borderColor: PALETTE.border, backgroundColor: PALETTE.panel }}
          >
            <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: PALETTE.secondary }}>
              Display Options
            </div>

            <ToggleSwitch
              label="Show Columns"
              checked={settings.showColumns}
              onChange={() => toggleSetting('showColumns')}
              color={PALETTE.primary}
            />
            <ToggleSwitch
              label="Data Types"
              checked={settings.showTypes}
              onChange={() => toggleSetting('showTypes')}
              disabled={!settings.showColumns}
              color={PALETTE.chartBlue}
            />
            <ToggleSwitch
              label="Primary Keys"
              checked={settings.showPk}
              onChange={() => toggleSetting('showPk')}
              disabled={!settings.showColumns}
              color={PALETTE.chartAmber}
            />
            <ToggleSwitch
              label="Foreign Keys"
              checked={settings.showFk}
              onChange={() => toggleSetting('showFk')}
              disabled={!settings.showColumns}
              color={PALETTE.chartBlue}
            />
            <ToggleSwitch
              label="NOT NULL"
              checked={settings.showNotNull}
              onChange={() => toggleSetting('showNotNull')}
              disabled={!settings.showColumns}
              color={PALETTE.chartEmerald}
            />
            <ToggleSwitch
              label="Enums"
              checked={settings.showEnums}
              onChange={() => toggleSetting('showEnums')}
              disabled={!settings.showColumns}
              color={PALETTE.chartViolet}
            />

            {uniqueSchemas.length > 1 && (
              <>
                <div className="border-t my-3" style={{ borderColor: PALETTE.border }} />
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: PALETTE.secondary }}>
                  Schema Filter
                </div>
                <select
                  value={settings.schemaFilter}
                  onChange={(e) => setSettings((prev) => ({ ...prev, schemaFilter: e.target.value }))}
                  className="w-full text-xs p-1.5 rounded border outline-none"
                  style={{ backgroundColor: PALETTE.background, borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                >
                  <option value="">All Schemas</option>
                  {uniqueSchemas.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </>
            )}

            <div className="border-t my-3" style={{ borderColor: PALETTE.border }} />
            <button
              onClick={fetchGraph}
              className="w-full px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer"
              style={{ backgroundColor: PALETTE.primary, color: PALETTE.background }}
            >Refresh Graph</button>

            <div className="border-t my-3" style={{ borderColor: PALETTE.border }} />
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: PALETTE.secondary }}>
              Legend
            </div>
            <div className="space-y-1 text-[10px]" style={{ color: PALETTE.textPrimary }}>
              <div className="flex items-center gap-2"><span>&#x1f511;</span> Primary Key</div>
              <div className="flex items-center gap-2"><span style={{ color: PALETTE.chartBlue }}>&#x1f517;</span> Foreign Key</div>
              <div className="flex items-center gap-2"><span style={{ color: PALETTE.chartAmber }}>&#x25C6;</span> NOT NULL</div>
              <div className="flex items-center gap-2"><span style={{ color: PALETTE.border }}>&#x25C7;</span> Nullable</div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] px-1 rounded-full" style={{ color: PALETTE.chartViolet, backgroundColor: PALETTE.chartViolet + '20' }}>E</span>
                Enum type
              </div>
            </div>
          </div>
        )}

        {/* Graph Area */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: PALETTE.background + 'CC' }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: PALETTE.border, borderTopColor: PALETTE.primary }} />
                <span className="text-xs font-bold" style={{ color: PALETTE.secondary }}>Generating entity graph...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3 p-6 rounded-lg border" style={{ backgroundColor: PALETTE.panel, borderColor: PALETTE.border }}>
                <span className="text-lg">&#x26A0;</span>
                <span className="text-sm font-bold" style={{ color: PALETTE.chartRose }}>{error}</span>
                <button
                  onClick={fetchGraph}
                  className="px-4 py-1.5 text-xs font-bold rounded cursor-pointer"
                  style={{ backgroundColor: PALETTE.primary, color: PALETTE.background }}
                >Retry</button>
              </div>
            </div>
          )}

          {!loading && !error && graphData && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <span className="text-2xl">&#x1F4CB;</span>
                <span className="text-sm font-bold" style={{ color: PALETTE.secondary }}>No tables found in this database</span>
              </div>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
            }}
            style={{ backgroundColor: PALETTE.background }}
          >
            <Controls
              style={{
                button: { backgroundColor: PALETTE.panel, borderColor: PALETTE.border, color: PALETTE.textPrimary },
              }}
            />
            <MiniMap
              nodeColor={PALETTE.primary + '40'}
              maskColor={PALETTE.background + 'CC'}
              style={{ backgroundColor: PALETTE.panel, borderColor: PALETTE.border }}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange, disabled = false, color }) {
  return (
    <label
      className={`flex items-center justify-between py-1.5 text-xs cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      style={{ color: PALETTE.textPrimary }}
    >
      <span>{label}</span>
      <div
        onClick={disabled ? undefined : onChange}
        className="w-8 h-4 rounded-full relative transition-colors cursor-pointer"
        style={{ backgroundColor: checked ? (color || PALETTE.primary) : PALETTE.border }}
      >
        <div
          className="w-3 h-3 rounded-full absolute top-0.5 transition-transform"
          style={{
            backgroundColor: '#fff',
            transform: checked ? 'translateX(16px)' : 'translateX(2px)',
          }}
        />
      </div>
    </label>
  );
}
