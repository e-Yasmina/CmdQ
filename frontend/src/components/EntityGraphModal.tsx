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
import ScrollArea from './ScrollArea';
import dagre from 'dagre';
import { apiService } from '../services/apiService';
import { PALETTE } from '../theme/palette';

const NODE_WIDTH = 280;
const COMPACT_NODE_WIDTH = 220;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 42;
const COMPACT_HEIGHT = 58;
const PADDING = 10;
const MAX_VISIBLE_COLUMNS = 10;
const COMPONENT_GAP_X = 180;
const COMPONENT_GAP_Y = 160;
const RANK_GAP = 220;
const NODE_GAP_X = 80;
const NODE_GAP_Y = 42;
const TARGET_ROW_WIDTH = 4200;

function isColumnsVisible(node) {
  const s = node.data?.settings;
  return Boolean(s?.showColumns || node.data?.isFocused);
}

function calcNodeHeight(node) {
  if (!isColumnsVisible(node)) return COMPACT_HEIGHT;
  const colCount = Math.min(node.columns?.length || 0, MAX_VISIBLE_COLUMNS);
  const hiddenCount = Math.max((node.columns?.length || 0) - MAX_VISIBLE_COLUMNS, 0);
  return HEADER_HEIGHT + PADDING + colCount * ROW_HEIGHT + (hiddenCount > 0 ? ROW_HEIGHT : 0) + (colCount > 0 ? PADDING : 0);
}

// ────────────────────────────────────────────────────────────────────────────
// LAYOUT ALGORITHM: LEGACY (rank-spreading overlay on dagre)
// ────────────────────────────────────────────────────────────────────────────
function getLayoutedElementsLegacy(nodes, edges, direction = 'LR') {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source).push(e.target);
      adj.get(e.target).push(e.source);
    }
  });

  const visited = new Set();
  const components = [];
  const isolatedNodes = [];

  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const neighbors = adj.get(node.id) || [];
    if (neighbors.length === 0) {
      isolatedNodes.push(node);
      visited.add(node.id);
      return;
    }
    const componentNodeIds = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const curr = queue.shift();
      componentNodeIds.push(curr);
      for (const nbr of (adj.get(curr) || [])) {
        if (!visited.has(nbr)) { visited.add(nbr); queue.push(nbr); }
      }
    }
    components.push(componentNodeIds);
  });

  components.sort((a, b) => b.length - a.length);

  const laidOutComponents = components.map((compNodeIds) => {
    const compNodeSet = new Set(compNodeIds);
    const compNodes = compNodeIds.map((id) => nodeMap.get(id));
    const compEdges = edges.filter((e) => compNodeSet.has(e.source) && compNodeSet.has(e.target));

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: direction, ranker: 'network-simplex', nodesep: NODE_GAP_Y, ranksep: RANK_GAP, marginx: 40, marginy: 40 });

    compNodes.forEach((n) => {
      const h = calcNodeHeight(n);
      const w = isColumnsVisible(n) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
      g.setNode(n.id, { width: w, height: h });
    });
    compEdges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);

    const rankMap = new Map();
    const isHorizontal = direction === 'LR' || direction === 'RL';
    compNodes.forEach((n) => {
      const pos = g.node(n.id) || { x: 0, y: 0 };
      const rankAxis = isHorizontal ? pos.x : pos.y;
      const rankKey = Math.round(rankAxis / RANK_GAP) * RANK_GAP;
      if (!rankMap.has(rankKey)) rankMap.set(rankKey, []);
      rankMap.get(rankKey).push({ node: n, order: isHorizontal ? pos.y : pos.x });
    });

    const sortedRankKeys = Array.from(rankMap.keys()).sort((a, b) => a - b);
    const localPositions = new Map();
    let currentRankOffset = 40, maxCrossAxis = 0, maxCompHeight = 0, maxCompWidth = 0;

    sortedRankKeys.forEach((rankKey) => {
      const items = rankMap.get(rankKey);
      items.sort((a, b) => a.order - b.order);
      const targetLaneSize = isColumnsVisible(items[0].node) ? 3 : 5;
      const laneCount = Math.min(Math.max(Math.ceil(items.length / targetLaneSize), 1), 4);
      const sampleItem = items[0].node;
      const itemW = isColumnsVisible(sampleItem) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
      const laneOffsets = new Array(laneCount).fill(40);

      items.forEach((item) => {
        let bestLane = 0, minOffset = laneOffsets[0];
        for (let c = 1; c < laneCount; c++) {
          if (laneOffsets[c] < minOffset) { minOffset = laneOffsets[c]; bestLane = c; }
        }
        const n = item.node;
        const h = calcNodeHeight(n);
        const posX = isHorizontal ? currentRankOffset : laneOffsets[bestLane];
        const posY = isHorizontal ? laneOffsets[bestLane] : currentRankOffset + bestLane * (COMPACT_HEIGHT + NODE_GAP_Y);
        const laneAdvance = isHorizontal ? h + NODE_GAP_Y : itemW + NODE_GAP_X;
        localPositions.set(n.id, { x: posX, y: posY });
        laneOffsets[bestLane] += laneAdvance;
        maxCrossAxis = Math.max(maxCrossAxis, laneOffsets[bestLane]);
        maxCompHeight = Math.max(maxCompHeight, posY + h + 40);
        maxCompWidth = Math.max(maxCompWidth, posX + itemW + 40);
      });

      currentRankOffset += isHorizontal ? itemW + RANK_GAP : laneCount * (COMPACT_HEIGHT + NODE_GAP_Y) + RANK_GAP;
    });

    const compWidth = Math.max(maxCompWidth, isHorizontal ? currentRankOffset : maxCrossAxis) + 40;
    const compHeight = Math.max(maxCompHeight, isHorizontal ? maxCrossAxis : currentRankOffset) + 40;
    return { nodeIds: compNodeIds, nodes: compNodes, edges: compEdges, width: compWidth, height: compHeight, localPositions };
  });

  let currentRowX = 0, currentRowY = 0, currentRowHeight = 0, maxCanvasWidth = 0;
  const finalPositions = new Map();

  laidOutComponents.forEach((comp) => {
    if (currentRowX > 0 && currentRowX + comp.width > TARGET_ROW_WIDTH) {
      currentRowX = 0; currentRowY += currentRowHeight + COMPONENT_GAP_Y; currentRowHeight = 0;
    }
    comp.nodeIds.forEach((id) => {
      const loc = comp.localPositions.get(id);
      finalPositions.set(id, { x: currentRowX + loc.x, y: currentRowY + loc.y });
    });
    currentRowX += comp.width + COMPONENT_GAP_X;
    currentRowHeight = Math.max(currentRowHeight, comp.height);
    maxCanvasWidth = Math.max(maxCanvasWidth, currentRowX);
  });

  if (isolatedNodes.length > 0) {
    const gridStartY = laidOutComponents.length > 0 ? currentRowY + currentRowHeight + COMPONENT_GAP_Y : 0;
    const canvasW = Math.max(maxCanvasWidth, 1400);
    const itemW = isColumnsVisible(isolatedNodes[0]) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
    const GRID_COLS = Math.min(Math.max(Math.floor(canvasW / (itemW + NODE_GAP_X)), 4), 8);
    const COL_GAP = itemW + NODE_GAP_X;
    isolatedNodes.forEach((node, idx) => {
      const colIdx = idx % GRID_COLS;
      const rowIdx = Math.floor(idx / GRID_COLS);
      const h = calcNodeHeight(node);
      finalPositions.set(node.id, { x: colIdx * COL_GAP, y: gridStartY + rowIdx * (h + NODE_GAP_Y) });
    });
  }

  const layoutedNodes = nodes.map((n) => {
    const pos = finalPositions.get(n.id) || { x: 0, y: 0 };
    return { ...n, position: { x: pos.x, y: pos.y }, data: { ...n.data } };
  });
  return { nodes: layoutedNodes, edges };
}

// ────────────────────────────────────────────────────────────────────────────
// LAYOUT ALGORITHM: ENHANCED (pure dagre – hierarchical with generous spacing)
// ────────────────────────────────────────────────────────────────────────────
function getLayoutedElementsDagre(nodes, edges, direction = 'LR') {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const isHorizontal = direction === 'LR' || direction === 'RL';

  // Build adjacency for component detection
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source).push(e.target);
      adj.get(e.target).push(e.source);
    }
  });

  // Separate connected components vs isolated
  const visited = new Set();
  const components = [];
  const isolatedNodes = [];

  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const neighbors = adj.get(node.id) || [];
    if (neighbors.length === 0) {
      isolatedNodes.push(node);
      visited.add(node.id);
      return;
    }
    const compIds = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const curr = queue.shift();
      compIds.push(curr);
      for (const nbr of (adj.get(curr) || [])) {
        if (!visited.has(nbr)) { visited.add(nbr); queue.push(nbr); }
      }
    }
    components.push(compIds);
  });

  components.sort((a, b) => b.length - a.length);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Layout each connected component with PURE dagre (no rank-spreading overlay)
  const laidOutComponents = components.map((compNodeIds) => {
    const compNodeSet = new Set(compNodeIds);
    const compNodes = compNodeIds.map((id) => nodeMap.get(id));
    const compEdges = edges.filter((e) => compNodeSet.has(e.source) && compNodeSet.has(e.target));

    // Count degree of each node for adaptive spacing
    const degreeMap = new Map();
    compNodes.forEach((n) => degreeMap.set(n.id, 0));
    compEdges.forEach((e) => {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
    });
    const maxDegree = Math.max(...Array.from(degreeMap.values()), 1);

    // Adaptive spacing: denser graphs get more generous separation
    const densityFactor = Math.min(maxDegree / 4, 3);
    const adaptiveNodeSep = Math.round(NODE_GAP_Y * (1.2 + densityFactor * 0.5));
    const adaptiveRankSep = Math.round(RANK_GAP * (1.0 + densityFactor * 0.3));

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: direction,
      ranker: 'network-simplex',
      nodesep: adaptiveNodeSep,
      ranksep: adaptiveRankSep,
      edgesep: Math.round(40 + densityFactor * 20),
      marginx: 60,
      marginy: 60,
    });

    compNodes.forEach((n) => {
      const h = calcNodeHeight(n);
      const w = isColumnsVisible(n) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
      g.setNode(n.id, { width: w, height: h });
    });

    compEdges.forEach((e) => {
      // Give higher weight to edges from/to high-degree nodes so dagre
      // keeps them closer and routes other edges around them
      const srcDeg = degreeMap.get(e.source) || 1;
      const tgtDeg = degreeMap.get(e.target) || 1;
      const weight = 1 + Math.floor(Math.max(srcDeg, tgtDeg) / 3);
      g.setEdge(e.source, e.target, { weight, minlen: 1 });
    });

    dagre.layout(g);

    // Read positions directly from dagre (no rank-spreading override)
    const localPositions = new Map();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    compNodes.forEach((n) => {
      const dagreNode = g.node(n.id);
      const w = isColumnsVisible(n) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
      const h = calcNodeHeight(n);
      // dagre gives center-of-node coordinates; convert to top-left
      const x = dagreNode.x - w / 2;
      const y = dagreNode.y - h / 2;
      localPositions.set(n.id, { x, y });

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });

    // Normalize positions so component starts near (0, 0)
    const offsetX = minX - 40;
    const offsetY = minY - 40;
    compNodes.forEach((n) => {
      const pos = localPositions.get(n.id);
      localPositions.set(n.id, { x: pos.x - offsetX, y: pos.y - offsetY });
    });

    const compWidth = maxX - minX + 120;
    const compHeight = maxY - minY + 120;

    return { nodeIds: compNodeIds, nodes: compNodes, edges: compEdges, width: compWidth, height: compHeight, localPositions };
  });

  // 2D Shelf Packing for components
  let currentRowX = 0, currentRowY = 0, currentRowHeight = 0, maxCanvasWidth = 0;
  const finalPositions = new Map();

  laidOutComponents.forEach((comp) => {
    if (currentRowX > 0 && currentRowX + comp.width > TARGET_ROW_WIDTH) {
      currentRowX = 0;
      currentRowY += currentRowHeight + COMPONENT_GAP_Y;
      currentRowHeight = 0;
    }
    comp.nodeIds.forEach((id) => {
      const loc = comp.localPositions.get(id);
      finalPositions.set(id, { x: currentRowX + loc.x, y: currentRowY + loc.y });
    });
    currentRowX += comp.width + COMPONENT_GAP_X;
    currentRowHeight = Math.max(currentRowHeight, comp.height);
    maxCanvasWidth = Math.max(maxCanvasWidth, currentRowX);
  });

  // Isolated nodes in a grid
  if (isolatedNodes.length > 0) {
    const gridStartY = laidOutComponents.length > 0 ? currentRowY + currentRowHeight + COMPONENT_GAP_Y : 0;
    const canvasW = Math.max(maxCanvasWidth, 1400);
    const itemW = isColumnsVisible(isolatedNodes[0]) ? NODE_WIDTH : COMPACT_NODE_WIDTH;
    const GRID_COLS = Math.min(Math.max(Math.floor(canvasW / (itemW + NODE_GAP_X)), 4), 8);
    const COL_GAP = itemW + NODE_GAP_X;
    isolatedNodes.forEach((node, idx) => {
      const colIdx = idx % GRID_COLS;
      const rowIdx = Math.floor(idx / GRID_COLS);
      const h = calcNodeHeight(node);
      finalPositions.set(node.id, { x: colIdx * COL_GAP, y: gridStartY + rowIdx * (h + NODE_GAP_Y) });
    });
  }

  // Final ReactFlow nodes with dagre positions
  const layoutedNodes = nodes.map((n) => {
    const pos = finalPositions.get(n.id) || { x: 0, y: 0 };
    return { ...n, position: { x: pos.x, y: pos.y }, data: { ...n.data } };
  });

  return { nodes: layoutedNodes, edges };
}

// Wrapper that selects between legacy and enhanced layout
function getLayoutedElements(nodes, edges, direction = 'LR', useEnhanced = true) {
  if (useEnhanced) {
    return getLayoutedElementsDagre(nodes, edges, direction);
  }
  return getLayoutedElementsLegacy(nodes, edges, direction);
}

function TableNode({ id, data }) {
  const {
    table,
    schema,
    columns,
    settings,
    isFocused,
    isHovered,
    isConnectedToHovered,
    hasHoverActive,
    neighborCount,
    onHide,
    onFocus,
    onHover,
    onLeave,
    onContextMenu,
    onInspect,
  } = data;

  const nodeHeight = calcNodeHeight(data);
  const displayCols = columns || [];
  const visibleCols = displayCols.slice(0, MAX_VISIBLE_COLUMNS);
  const hiddenColumnCount = Math.max(displayCols.length - visibleCols.length, 0);
  const compact = !isColumnsVisible({ data: { settings, isFocused }, columns });

  // Opacity & Highlight calculation
  let opacity = 1;
  if (hasHoverActive) {
    opacity = isHovered || isConnectedToHovered ? 1 : 0.25;
  }

  const borderHighlight = isFocused
    ? PALETTE.chartAmber
    : isHovered
      ? PALETTE.primary
      : isConnectedToHovered
        ? PALETTE.chartBlue
        : PALETTE.border;

  const shadowStyle = isFocused
    ? `0 0 0 2px ${PALETTE.chartAmber}, 0 8px 24px rgba(0,0,0,0.5)`
    : isHovered
      ? `0 0 0 2px ${PALETTE.primary}, 0 8px 20px rgba(0,0,0,0.4)`
      : isConnectedToHovered
        ? `0 0 0 1px ${PALETTE.chartBlue}, 0 4px 12px rgba(0,0,0,0.3)`
        : '0 4px 12px rgba(0,0,0,0.2)';

  return (
    <div
      className="rounded-lg overflow-hidden border transition-all duration-200"
      onMouseEnter={() => onHover && onHover(id)}
      onMouseLeave={() => onLeave && onLeave()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu && onContextMenu(e, id);
      }}
      onDoubleClick={() => onInspect && onInspect(id)}
      style={{
        width: compact ? COMPACT_NODE_WIDTH : NODE_WIDTH,
        minHeight: nodeHeight,
        backgroundColor: PALETTE.panel,
        borderColor: borderHighlight,
        boxShadow: shadowStyle,
        opacity,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: isFocused ? PALETTE.chartAmber : PALETTE.primary,
          width: 8,
          height: 8,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: isFocused ? PALETTE.chartAmber : PALETTE.primary,
          width: 8,
          height: 8,
        }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{
          background: isFocused ? PALETTE.chartAmber : PALETTE.primary,
          width: 8,
          height: 8,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          background: isFocused ? PALETTE.chartAmber : PALETTE.primary,
          width: 8,
          height: 8,
        }}
      />

      {/* Header with Title and Quick Action Buttons */}
      <div
        className="px-2.5 py-1.5 flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing"
        style={{
          backgroundColor: isFocused
            ? PALETTE.chartAmber + '25'
            : PALETTE.primary + '18',
          borderBottom: compact ? 'none' : `1px solid ${PALETTE.border}`,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className="text-xs font-bold truncate select-none"
            style={{ color: isFocused ? PALETTE.chartAmber : PALETTE.textPrimary }}
            title={`${schema}.${table}`}
          >
            {table}
          </span>
          {displayCols.length > 0 && (
            <span
              className="text-[9px] px-1 py-0.2 rounded font-mono flex-shrink-0"
              style={{ backgroundColor: PALETTE.border, color: PALETTE.secondary }}
            >
              {displayCols.length}
            </span>
          )}
        </div>

        {/* Action Controls: Focus and Hide */}
        <div className="flex items-center gap-1 flex-shrink-0 nodrag">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFocus && onFocus(id);
            }}
            title={isFocused ? 'Exit focus' : 'Focus (Show only this table & connected neighbors)'}
            className="w-5 h-5 flex items-center justify-center rounded text-[11px] transition-colors cursor-pointer hover:bg-white/20"
            style={{
              color: isFocused ? PALETTE.chartAmber : PALETTE.secondary,
              backgroundColor: isFocused ? PALETTE.chartAmber + '30' : 'transparent',
            }}
          >
            🎯
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHide && onHide(id);
            }}
            title="Hide table and its connections"
            className="w-5 h-5 flex items-center justify-center rounded text-[11px] transition-colors cursor-pointer hover:bg-red-500/20 hover:text-red-400"
            style={{ color: PALETTE.secondary }}
          >
            ✕
          </button>
        </div>
      </div>

      {compact && (
        <div className="px-2.5 pb-2 -mt-0.5 flex items-center gap-2 text-[10px] font-mono" style={{ color: PALETTE.secondary }}>
          {displayCols.length > 0 && <span>{displayCols.length} cols</span>}
          {neighborCount > 0 && <span>{neighborCount} rels</span>}
        </div>
      )}

      {/* Columns Listing */}
      {!compact && settings.showColumns && displayCols.length > 0 && (
        <div className="px-2 py-1.5">
          {visibleCols.map((col) => (
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
                <span
                  className="text-[9px] truncate max-w-[80px] ml-auto font-mono"
                  style={{ color: PALETTE.secondary }}
                >
                  {col.type}
                </span>
              )}
              {settings.showNotNull && col.not_null && !col.is_pk && (
                <span
                  className="text-[8px] px-0.5 rounded"
                  style={{
                    color: PALETTE.chartAmber,
                    backgroundColor: PALETTE.chartAmber + '15',
                  }}
                >
                  NN
                </span>
              )}
              {col.enum_values && col.enum_values.length > 0 && settings.showEnums && (
                <span
                  className="text-[8px] px-1 rounded-full"
                  style={{
                    color: PALETTE.chartViolet,
                    backgroundColor: PALETTE.chartViolet + '15',
                  }}
                >
                  E
                </span>
              )}
            </div>
          ))}
          {hiddenColumnCount > 0 && (
            <div
              className="text-[10px] py-px text-center"
              style={{ height: ROW_HEIGHT, color: PALETTE.secondary }}
            >
              + {hiddenColumnCount} more columns
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { tableNode: TableNode };

export default function EntityGraphModal({ activeConfig, targetDatabase, targetSchema, onClose }) {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sidebar & Navigation states
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('tables'); // 'tables' | 'settings'
  const [tableSearch, setTableSearch] = useState('');

  // Step-by-step & Visual Isolation states
  const [hiddenNodeIds, setHiddenNodeIds] = useState(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [userPositions, setUserPositions] = useState(new Map());

  // Right-click Context Menu & Inspector states
  const [contextMenu, setContextMenu] = useState(null); // { x, y, nodeId }
  const [inspectedNodeId, setInspectedNodeId] = useState(null);
  const [inspectedTab, setInspectedTab] = useState('columns'); // 'columns' | 'relations' | 'sql'
  const [inspectorSearch, setInspectorSearch] = useState('');
  const [copiedToast, setCopiedToast] = useState(null);

  // Layout algorithm toggle: enhanced (pure dagre) vs legacy (rank-spreading)
  const [useEnhancedLayout, setUseEnhancedLayout] = useState(true);

  const [settings, setSettings] = useState({
    showColumns: false,
    showTypes: true,
    showPk: true,
    showFk: true,
    showNotNull: true,
    showEnums: true,
    showEdgeLabels: false,
    showM2M: false, // Default false to avoid artificial web explosion
    hideIsolated: true,
    layoutDirection: 'LR',
    maxNodes: 80,
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
        include_columns: true,
        include_column_types: true,
        include_pk: true,
        include_fk: true,
        include_not_null: true,
        include_enums: true,
        max_nodes: settings.maxNodes,
      };
      const res = await apiService.fetchEntityGraph(payload);
      if (res.status === 'success') {
        setGraphData(res.graph);
        setHiddenNodeIds(new Set());
        setFocusedNodeId(null);
        setUserPositions(new Map());
      } else {
        setError(res.message || 'Failed to generate graph');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeConfig, targetSchema, settings.schemaFilter, settings.maxNodes]);

  useEffect(() => {
    fetchGraph();
  }, []);

  // Toast notification helper
  const showToast = useCallback((msg) => {
    setCopiedToast(msg);
    setTimeout(() => setCopiedToast(null), 2200);
  }, []);

  // Compute connections map for hover / focus resolution
  const adjacencyMap = useMemo(() => {
    const map = new Map();
    if (!graphData) return map;

    graphData.nodes.forEach((n) => map.set(n.id, new Set()));

    graphData.edges.forEach((e) => {
      if (!settings.showM2M && e.relationship_type === 'M:N') return;
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source).add(e.target);
      map.get(e.target).add(e.source);
    });

    return map;
  }, [graphData, settings.showM2M]);

  // Handlers for Hide and Focus
  const handleHideNode = useCallback((nodeId) => {
    setHiddenNodeIds((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
    if (focusedNodeId === nodeId) {
      setFocusedNodeId(null);
    }
    setContextMenu(null);
  }, [focusedNodeId]);

  const handleUnhideNode = useCallback((nodeId) => {
    setHiddenNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const handleToggleNodeVisibility = useCallback((nodeId) => {
    setHiddenNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleShowAllNodes = useCallback(() => {
    setHiddenNodeIds(new Set());
    setFocusedNodeId(null);
  }, []);

  const handleHideAllNodes = useCallback(() => {
    if (!graphData) return;
    setHiddenNodeIds(new Set(graphData.nodes.map((n) => n.id)));
    setFocusedNodeId(null);
  }, [graphData]);

  const handleHideIsolatedNodes = useCallback(() => {
    if (!graphData) return;
    const isolated = new Set();
    graphData.nodes.forEach((n) => {
      const neighbors = adjacencyMap.get(n.id);
      if (!neighbors || neighbors.size === 0) {
        isolated.add(n.id);
      }
    });
    setHiddenNodeIds((prev) => new Set([...prev, ...isolated]));
  }, [graphData, adjacencyMap]);

  const handleInvertSelection = useCallback(() => {
    if (!graphData) return;
    setHiddenNodeIds((prev) => {
      const next = new Set();
      graphData.nodes.forEach((n) => {
        if (!prev.has(n.id)) next.add(n.id);
      });
      return next;
    });
  }, [graphData]);

  const handleToggleFocus = useCallback((nodeId) => {
    setFocusedNodeId((prev) => (prev === nodeId ? null : nodeId));
    setContextMenu(null);
  }, []);

  // Context Menu Handlers
  const handleOpenContextMenu = useCallback((e, nodeId) => {
    const clickX = e.clientX || (e.nativeEvent ? e.nativeEvent.clientX : 200);
    const clickY = e.clientY || (e.nativeEvent ? e.nativeEvent.clientY : 200);
    // Boundary check so context menu doesn't overflow window
    const menuWidth = 240;
    const menuHeight = 260;
    const x = clickX + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : clickX;
    const y = clickY + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : clickY;
    setContextMenu({ x, y, nodeId });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleOpenInspector = useCallback((nodeId) => {
    setInspectedNodeId(nodeId);
    setInspectedTab('columns');
    setInspectorSearch('');
    setContextMenu(null);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setInspectedNodeId(null);
  }, []);

  // Jump and center view on target node
  const handleJumpToNode = useCallback((targetNodeId) => {
    // Unhide if hidden
    setHiddenNodeIds((prev) => {
      if (prev.has(targetNodeId)) {
        const next = new Set(prev);
        next.delete(targetNodeId);
        return next;
      }
      return prev;
    });

    if (!rfInstance) return;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (targetNode && targetNode.position) {
      const w = NODE_WIDTH;
      const h = HEADER_HEIGHT;
      rfInstance.setCenter(targetNode.position.x + w / 2, targetNode.position.y + h / 2, {
        duration: 500,
        zoom: 0.95,
      });
    }
  }, [rfInstance, nodes]);

  const handleNodeDragStop = useCallback((_, node) => {
    setUserPositions((prev) => {
      const next = new Map(prev);
      next.set(node.id, { x: node.position.x, y: node.position.y });
      return next;
    });
  }, []);

  const handleResetAutoLayout = useCallback(() => {
    setUserPositions(new Map());
  }, []);

  // Compute Layout elements with dynamic filtering and user-dragged position preservation
  const layouted = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };

    // 1. Determine which nodes are eligible to be visible
    let visibleNodeIds = new Set(
      graphData.nodes
        .map((n) => n.id)
        .filter((id) => !hiddenNodeIds.has(id))
    );

    // If focused on a node, keep only focused node + its 1-hop connected neighbors
    if (focusedNodeId && visibleNodeIds.has(focusedNodeId)) {
      const neighbors = adjacencyMap.get(focusedNodeId) || new Set();
      visibleNodeIds = new Set(
        [...visibleNodeIds].filter((id) => id === focusedNodeId || neighbors.has(id))
      );
    }

    // If hide isolated tables is enabled
    if (settings.hideIsolated) {
      visibleNodeIds = new Set(
        [...visibleNodeIds].filter((id) => {
          const neighbors = adjacencyMap.get(id);
          return neighbors && neighbors.size > 0;
        })
      );
    }

    // 2. Filter and build RF edges
    const filteredEdges = graphData.edges.filter((e) => {
      if (!settings.showM2M && e.relationship_type === 'M:N') return false;
      return visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target);
    });

    const edgeGroups = filteredEdges.reduce((groups, edge) => {
      const key = `${edge.source}__${edge.target}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
      return groups;
    }, new Map());

    const M2M_COLOR = PALETTE.chartViolet || '#a78bfa';
    const HIGHLIGHT_COLOR = PALETTE.primary;

    const hoveredNeighbors = hoveredNodeId ? adjacencyMap.get(hoveredNodeId) || new Set() : null;

    const rfEdges = Array.from(edgeGroups.entries()).map(([key, groupedEdges]) => {
      const first = groupedEdges[0];
      const hasM2M = groupedEdges.some((e) => e.relationship_type === 'M:N');
      const m2mEdge = groupedEdges.find((e) => e.relationship_type === 'M:N');
      const directEdges = groupedEdges.filter((e) => e.relationship_type !== 'M:N');

      let relLabel = '';
      if (hasM2M) {
        relLabel = m2mEdge.via_table ? `M:N via ${m2mEdge.via_table}` : 'M:N';
      } else if (directEdges.length > 0) {
        const types = [...new Set(directEdges.map((e) => e.relationship_type))];
        relLabel = types.join(' / ');
      } else if (groupedEdges.length > 1) {
        relLabel = `${groupedEdges.length} relationships`;
      }

      const colLabel =
        groupedEdges.length === 1 && first.source_column
          ? `${first.source_column} \u2192 ${first.target_column}`
          : relLabel;

      const tooltipLines = groupedEdges.map((e) => {
        const via = e.via_table ? ` (via ${e.via_table})` : '';
        return `${e.relationship_type || '?'}: ${e.source_column || '*'} -> ${e.target_column || '*'}${via}`;
      });

      // Hover / Focus highlighting on edges
      const isEdgeConnectedToHovered =
        hoveredNodeId && (first.source === hoveredNodeId || first.target === hoveredNodeId);
      const isEdgeConnectedToFocused =
        focusedNodeId && (first.source === focusedNodeId || first.target === focusedNodeId);

      let edgeColor = hasM2M ? M2M_COLOR : PALETTE.secondary;
      let strokeWidth = hasM2M ? 2.2 : groupedEdges.length > 1 ? 2 : 1.4;
      let opacity = 0.75;

      if (hoveredNodeId) {
        if (isEdgeConnectedToHovered) {
          edgeColor = HIGHLIGHT_COLOR;
          strokeWidth = 3;
          opacity = 1;
        } else {
          opacity = 0.1;
        }
      } else if (focusedNodeId && isEdgeConnectedToFocused) {
        edgeColor = PALETTE.chartAmber;
        strokeWidth = 2.5;
        opacity = 1;
      }

      return {
        id: key,
        source: first.source,
        target: first.target,
        label: settings.showEdgeLabels ? colLabel : undefined,
        title: tooltipLines.join('\n'),
        labelStyle: { fill: edgeColor, fontWeight: 500, fontSize: 10 },
        labelBgStyle: { fill: PALETTE.panel, fillOpacity: 0.95 },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 4,
        type: 'smoothstep',
        animated: isEdgeConnectedToHovered || isEdgeConnectedToFocused,
        style: {
          stroke: edgeColor,
          strokeWidth,
          opacity,
          strokeDasharray: hasM2M ? '8 4' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 14,
          height: 14,
        },
      };
    });

    // 3. Build RF Nodes
    const rfNodes = graphData.nodes
      .filter((n) => visibleNodeIds.has(n.id))
      .map((n) => {
        const isFocused = focusedNodeId === n.id;
        const isHovered = hoveredNodeId === n.id;
        const neighbors = adjacencyMap.get(n.id) || new Set();
        const isConnectedToHovered = hoveredNeighbors ? hoveredNeighbors.has(n.id) : false;

        return {
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
            isFocused,
            isHovered,
            isConnectedToHovered,
            hasHoverActive: Boolean(hoveredNodeId),
            neighborCount: neighbors.size,
            onHide: handleHideNode,
            onFocus: handleToggleFocus,
            onHover: setHoveredNodeId,
            onLeave: () => setHoveredNodeId(null),
            onContextMenu: handleOpenContextMenu,
            onInspect: handleOpenInspector,
          },
        };
      });

    const layoutResult = getLayoutedElements(rfNodes, rfEdges, settings.layoutDirection, useEnhancedLayout);

    // Apply user-dragged positions if present
    const finalNodes = layoutResult.nodes.map((node) => {
      if (userPositions.has(node.id)) {
        return {
          ...node,
          position: userPositions.get(node.id),
        };
      }
      return node;
    });

    return { nodes: finalNodes, edges: layoutResult.edges };
  }, [
    graphData,
    hiddenNodeIds,
    focusedNodeId,
    hoveredNodeId,
    userPositions,
    adjacencyMap,
    settings,
    useEnhancedLayout,
    handleHideNode,
    handleToggleFocus,
    handleOpenContextMenu,
    handleOpenInspector,
  ]);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  useEffect(() => {
    if (!rfInstance || loading || error || layouted.nodes.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      rfInstance.fitView({
        padding: focusedNodeId ? 0.35 : 0.12,
        duration: 300,
        minZoom: focusedNodeId ? 0.75 : 0.38,
        maxZoom: focusedNodeId ? 1.15 : 0.8,
      });
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [rfInstance, loading, error, layouted.nodes.length, focusedNodeId, settings.showColumns, settings.hideIsolated]);

  const handleFitView = useCallback(() => {
    if (rfInstance) {
      rfInstance.fitView({
        padding: focusedNodeId ? 0.35 : 0.12,
        duration: 300,
        minZoom: focusedNodeId ? 0.75 : 0.38,
        maxZoom: focusedNodeId ? 1.15 : 0.8,
      });
    }
  }, [rfInstance, focusedNodeId]);

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

  // Filtered tables for the Tables tab in the sidebar
  const filteredTablesList = useMemo(() => {
    if (!graphData) return [];
    const q = tableSearch.toLowerCase().trim();
    return graphData.nodes.filter((n) => {
      if (!q) return true;
      return n.table.toLowerCase().includes(q) || n.schema.toLowerCase().includes(q);
    });
  }, [graphData, tableSearch]);

  const totalTablesCount = graphData?.nodes?.length || 0;
  const visibleTablesCount = layouted.nodes.length;
  const hiddenCount = totalTablesCount - visibleTablesCount;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: PALETTE.background }}>
      {/* Top Navigation Bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: PALETTE.border, backgroundColor: PALETTE.panel }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold" style={{ color: PALETTE.primary }}>
            Entity Relationship Graph
          </h2>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: PALETTE.border, color: PALETTE.secondary }}
          >
            {targetDatabase || 'Database'}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded font-mono"
            style={{ backgroundColor: PALETTE.primary + '15', color: PALETTE.primary }}
          >
            {visibleTablesCount} / {totalTablesCount} visible
          </span>
          {focusedNodeId && (
            <span
              className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1.5 font-bold"
              style={{ backgroundColor: PALETTE.chartAmber + '25', color: PALETTE.chartAmber }}
            >
              🎯 Focus Mode Active
              <button
                onClick={() => setFocusedNodeId(null)}
                className="hover:underline cursor-pointer ml-1 text-[10px]"
              >
                (Clear)
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Layout Algorithm Toggle */}
          <button
            onClick={() => {
              setUseEnhancedLayout((prev) => !prev);
              setUserPositions(new Map());
            }}
            className="px-2.5 py-1 text-xs font-bold rounded transition-colors cursor-pointer border flex items-center gap-1"
            style={{
              borderColor: useEnhancedLayout ? PALETTE.chartEmerald : PALETTE.border,
              color: useEnhancedLayout ? PALETTE.chartEmerald : PALETTE.secondary,
              backgroundColor: useEnhancedLayout ? PALETTE.chartEmerald + '15' : PALETTE.background,
            }}
            title={useEnhancedLayout ? 'Using Enhanced (dagre) layout — click to switch to Legacy' : 'Using Legacy layout — click to switch to Enhanced (dagre)'}
          >
            <span>{useEnhancedLayout ? '⚡' : '📐'}</span> {useEnhancedLayout ? 'Enhanced' : 'Legacy'}
          </button>
          {/* Re-layout Button */}
          <button
            onClick={() => {
              setUserPositions(new Map());
            }}
            className="px-2.5 py-1 text-xs font-bold rounded transition-colors cursor-pointer border flex items-center gap-1"
            style={{
              borderColor: PALETTE.primary,
              color: PALETTE.primary,
              backgroundColor: PALETTE.primary + '12',
            }}
            title="Re-run layout algorithm and reset all node positions"
          >
            <span>🔄</span> Re-layout
          </button>
          {userPositions.size > 0 && (
            <button
              onClick={handleResetAutoLayout}
              className="px-2.5 py-1 text-xs font-bold rounded transition-colors cursor-pointer border flex items-center gap-1"
              style={{
                borderColor: PALETTE.chartAmber,
                color: PALETTE.chartAmber,
                backgroundColor: PALETTE.chartAmber + '15',
              }}
              title="Reset all user-dragged node positions back to auto-layout"
            >
              <span>🔄</span> Auto-Layout
            </button>
          )}
          <button
            onClick={handleFitView}
            className="px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer border"
            style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary, backgroundColor: PALETTE.background }}
            title="Fit to view"
          >
            &#x29C9; Fit View
          </button>
          <button
            onClick={handleExportPng}
            className="px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer border"
            style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary, backgroundColor: PALETTE.background }}
            title="Export as PNG"
          >
            &#x2B07; Export PNG
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer border flex items-center gap-1.5"
            style={{
              borderColor: sidebarOpen ? PALETTE.primary : PALETTE.border,
              color: sidebarOpen ? PALETTE.primary : PALETTE.textPrimary,
              backgroundColor: sidebarOpen ? PALETTE.primary + '15' : PALETTE.background,
            }}
          >
            <span>&#x2630;</span> {sidebarOpen ? 'Hide Panel' : 'Tools & Tables'}
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded transition-colors cursor-pointer hover:bg-white/10"
            style={{ color: PALETTE.textPrimary }}
          >
            &#x2715;
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Tables Explorer (Step-by-Step) & Settings */}
        {sidebarOpen && (
          <div
            className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden"
            style={{ borderColor: PALETTE.border, backgroundColor: PALETTE.panel }}
          >
            {/* Sidebar Tabs */}
            <div
              className="flex border-b text-xs font-bold"
              style={{ borderColor: PALETTE.border, backgroundColor: PALETTE.background }}
            >
              <button
                onClick={() => setSidebarTab('tables')}
                className="flex-1 py-2 text-center transition-colors cursor-pointer border-b-2"
                style={{
                  borderColor: sidebarTab === 'tables' ? PALETTE.primary : 'transparent',
                  color: sidebarTab === 'tables' ? PALETTE.primary : PALETTE.secondary,
                  backgroundColor: sidebarTab === 'tables' ? PALETTE.panel : 'transparent',
                }}
              >
                📋 Tables ({visibleTablesCount}/{totalTablesCount})
              </button>
              <button
                onClick={() => setSidebarTab('settings')}
                className="flex-1 py-2 text-center transition-colors cursor-pointer border-b-2"
                style={{
                  borderColor: sidebarTab === 'settings' ? PALETTE.primary : 'transparent',
                  color: sidebarTab === 'settings' ? PALETTE.primary : PALETTE.secondary,
                  backgroundColor: sidebarTab === 'settings' ? PALETTE.panel : 'transparent',
                }}
              >
                ⚙ Settings
              </button>
            </div>

            {/* TAB 1: Tables Manager (Step-by-Step Explorer) */}
            {sidebarTab === 'tables' && (
              <div className="flex-1 flex flex-col p-3 overflow-hidden">
                {/* Search Bar */}
                <div className="mb-2">
                  <input
                    type="text"
                    placeholder="Search table name..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded border outline-none"
                    style={{
                      backgroundColor: PALETTE.background,
                      borderColor: PALETTE.border,
                      color: PALETTE.textPrimary,
                    }}
                  />
                </div>

                {/* Bulk Actions */}
                <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                  <button
                    onClick={handleShowAllNodes}
                    className="px-2 py-1 text-[11px] font-bold rounded border transition-colors cursor-pointer hover:bg-white/5"
                    style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                  >
                    👁 Show All
                  </button>
                  <button
                    onClick={handleHideAllNodes}
                    className="px-2 py-1 text-[11px] font-bold rounded border transition-colors cursor-pointer hover:bg-white/5"
                    style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                  >
                    🚫 Hide All
                  </button>
                  <button
                    onClick={handleHideIsolatedNodes}
                    className="px-2 py-1 text-[10px] font-bold rounded border transition-colors cursor-pointer hover:bg-white/5"
                    style={{ borderColor: PALETTE.border, color: PALETTE.secondary }}
                  >
                    🔗 Only Connected
                  </button>
                  <button
                    onClick={handleInvertSelection}
                    className="px-2 py-1 text-[10px] font-bold rounded border transition-colors cursor-pointer hover:bg-white/5"
                    style={{ borderColor: PALETTE.border, color: PALETTE.secondary }}
                  >
                    🔄 Invert
                  </button>
                </div>

                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-xs flex justify-between" style={{ color: PALETTE.secondary }}>
                  <span>Table Visibility</span>
                  <span className="font-mono">{filteredTablesList.length} items</span>
                </div>

                {/* Scrollable Table Checklist */}
                <ScrollArea
                  className="flex-1 min-h-0 overflow-y-auto border rounded p-1.5 space-y-1 pr-1"
                  style={{ borderColor: PALETTE.border, backgroundColor: PALETTE.background + '80' }}
                >
                  {filteredTablesList.length === 0 ? (
                    <div className="text-xs text-center py-4" style={{ color: PALETTE.secondary }}>
                      No matching tables
                    </div>
                  ) : (
                    filteredTablesList.map((n) => {
                      const isHidden = hiddenNodeIds.has(n.id);
                      const isFocused = focusedNodeId === n.id;
                      const neighborCount = (adjacencyMap.get(n.id) || new Set()).size;

                      return (
                        <div
                          key={n.id}
                          className="flex items-center justify-between px-2 py-1 rounded text-xs transition-colors hover:bg-white/5"
                          style={{
                            backgroundColor: isFocused ? PALETTE.chartAmber + '15' : 'transparent',
                          }}
                        >
                            <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!isHidden}
                                onChange={() => handleToggleNodeVisibility(n.id)}
                                className="accent-current cursor-pointer"
                                style={{ accentColor: PALETTE.primary }}
                              />
                              <span
                                className={`truncate font-medium ${isHidden ? 'line-through opacity-40' : ''}`}
                                style={{
                                  color: isFocused ? PALETTE.chartAmber : PALETTE.textPrimary,
                                }}
                                title={n.id}
                              >
                                {n.table}
                              </span>
                            </label>

                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                              {neighborCount > 0 && (
                                <span
                                  className="text-[9px] px-1 rounded font-mono"
                                  style={{
                                    backgroundColor: PALETTE.chartBlue + '15',
                                    color: PALETTE.chartBlue,
                                  }}
                                  title={`${neighborCount} connections`}
                                >
                                  {neighborCount}c
                                </span>
                              )}
                              <button
                                onClick={() => handleToggleFocus(n.id)}
                                title={isFocused ? 'Exit focus' : 'Focus table'}
                                className="w-5 h-5 flex items-center justify-center rounded text-[10px] cursor-pointer hover:bg-white/20"
                                style={{
                                  color: isFocused ? PALETTE.chartAmber : PALETTE.secondary,
                                }}
                              >
                                🎯
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                </ScrollArea>
              </div>
            )}

            {/* TAB 2: Display & Layout Settings */}
            {sidebarTab === 'settings' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: PALETTE.secondary }}>
                    Display Elements
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
                  <ToggleSwitch
                    label="Edge Labels"
                    checked={settings.showEdgeLabels}
                    onChange={() => toggleSetting('showEdgeLabels')}
                    color={PALETTE.chartBlue}
                  />
                  <ToggleSwitch
                    label="Show M:N Virtual Edges"
                    checked={settings.showM2M}
                    onChange={() => toggleSetting('showM2M')}
                    color={PALETTE.chartViolet}
                  />
                  <ToggleSwitch
                    label="Hide Isolated Tables"
                    checked={settings.hideIsolated}
                    onChange={() => toggleSetting('hideIsolated')}
                    color={PALETTE.chartEmerald}
                  />
                </div>

                <div className="border-t pt-3" style={{ borderColor: PALETTE.border }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: PALETTE.secondary }}>
                    Layout Direction
                  </div>
                  <select
                    value={settings.layoutDirection}
                    onChange={(e) => setSettings((prev) => ({ ...prev, layoutDirection: e.target.value }))}
                    className="w-full text-xs p-1.5 rounded border outline-none"
                    style={{ backgroundColor: PALETTE.background, borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                  >
                    <option value="LR">Left to Right (Horizontal)</option>
                    <option value="TB">Top to Bottom (Vertical)</option>
                  </select>
                </div>

                <div className="border-t pt-3" style={{ borderColor: PALETTE.border }}>
                  <div className="text-[10px] mb-1" style={{ color: PALETTE.secondary }}>Max Tables Loaded</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={300}
                      step={10}
                      value={settings.maxNodes}
                      onChange={(e) => setSettings((prev) => ({ ...prev, maxNodes: Number(e.target.value) }))}
                      className="flex-1 h-1 accent-current"
                      style={{ accentColor: PALETTE.primary }}
                    />
                    <span className="text-[11px] font-mono w-8 text-right" style={{ color: PALETTE.textPrimary }}>
                      {settings.maxNodes}
                    </span>
                  </div>
                </div>

                {uniqueSchemas.length > 1 && (
                  <div className="border-t pt-3" style={{ borderColor: PALETTE.border }}>
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
                  </div>
                )}

                <div className="border-t pt-3" style={{ borderColor: PALETTE.border }}>
                  <button
                    onClick={fetchGraph}
                    className="w-full px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer"
                    style={{ backgroundColor: PALETTE.primary, color: PALETTE.background }}
                  >
                    🔄 Refresh Graph
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Graph Canvas Area */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          {/* Floating Context Pill Banner */}
          {(focusedNodeId || hiddenCount > 0) && (
            <div className="absolute top-3 left-4 z-20 flex items-center gap-2">
              {focusedNodeId && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-lg text-xs font-bold"
                  style={{
                    backgroundColor: PALETTE.panel,
                    borderColor: PALETTE.chartAmber,
                    color: PALETTE.textPrimary,
                  }}
                >
                  <span style={{ color: PALETTE.chartAmber }}>🎯 Focused: {focusedNodeId}</span>
                  <button
                    onClick={() => setFocusedNodeId(null)}
                    className="px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:bg-white/10"
                    style={{ color: PALETTE.chartAmber }}
                  >
                    Exit Focus Mode
                  </button>
                </div>
              )}

              {hiddenCount > 0 && !focusedNodeId && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-lg text-xs font-medium"
                  style={{
                    backgroundColor: PALETTE.panel,
                    borderColor: PALETTE.border,
                    color: PALETTE.secondary,
                  }}
                >
                  <span>{hiddenCount} tables hidden</span>
                  <button
                    onClick={handleShowAllNodes}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer hover:underline"
                    style={{ color: PALETTE.primary }}
                  >
                    Show All
                  </button>
                </div>
              )}
            </div>
          )}

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
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && graphData && layouted.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3 p-4 rounded border" style={{ backgroundColor: PALETTE.panel, borderColor: PALETTE.border }}>
                <span className="text-2xl">&#x1F4CB;</span>
                <span className="text-sm font-bold" style={{ color: PALETTE.secondary }}>
                  {totalTablesCount > 0 ? 'All tables are currently hidden' : 'No tables found in this database'}
                </span>
                {totalTablesCount > 0 && (
                  <button
                    onClick={handleShowAllNodes}
                    className="px-3 py-1.5 text-xs font-bold rounded cursor-pointer"
                    style={{ backgroundColor: PALETTE.primary, color: PALETTE.background }}
                  >
                    Unhide All Tables
                  </button>
                )}
              </div>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            onNodeContextMenu={(e, node) => handleOpenContextMenu(e, node.id)}
            onPaneClick={handleCloseContextMenu}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12, minZoom: 0.38, maxZoom: 0.8 }}
            minZoom={0.25}
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

          {/* Right-Click Context Menu */}
          {contextMenu && (
            <TableContextMenu
              contextMenu={contextMenu}
              graphData={graphData}
              focusedNodeId={focusedNodeId}
              onInspect={handleOpenInspector}
              onFocus={handleToggleFocus}
              onHide={handleHideNode}
              onClose={handleCloseContextMenu}
              showToast={showToast}
            />
          )}

          {/* Detailed Table Inspector Modal */}
          {inspectedNodeId && (
            <TableInspectorModal
              nodeId={inspectedNodeId}
              graphData={graphData}
              inspectedTab={inspectedTab}
              setInspectedTab={setInspectedTab}
              inspectorSearch={inspectorSearch}
              setInspectorSearch={setInspectorSearch}
              onClose={handleCloseInspector}
              onJumpToNode={handleJumpToNode}
              onFocusNode={handleToggleFocus}
              focusedNodeId={focusedNodeId}
              showToast={showToast}
            />
          )}

          {/* Toast Notification */}
          {copiedToast && (
            <div
              className="fixed bottom-6 right-6 z-[350] px-4 py-2 rounded-lg border shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-200"
              style={{
                backgroundColor: PALETTE.panel,
                borderColor: PALETTE.primary,
                color: PALETTE.textPrimary,
              }}
            >
              <span style={{ color: PALETTE.chartEmerald }}>✓</span>
              <span>{copiedToast}</span>
            </div>
          )}
        </div>
      </div>
    </div >
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

function TableContextMenu({
  contextMenu,
  graphData,
  focusedNodeId,
  onInspect,
  onFocus,
  onHide,
  onClose,
  showToast,
}) {
  const node = graphData?.nodes?.find((n) => n.id === contextMenu.nodeId);
  if (!node) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[250]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[260] w-64 rounded-xl border shadow-2xl overflow-hidden py-1.5 backdrop-blur-md"
        style={{
          top: contextMenu.y,
          left: contextMenu.x,
          backgroundColor: PALETTE.panel,
          borderColor: PALETTE.border,
          boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
        }}
      >
        {/* Table Header */}
        <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: PALETTE.border }}>
          <span className="text-base">&#x1F5C3;</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate" style={{ color: PALETTE.textPrimary }}>
              {node.table}
            </div>
            <div className="text-[10px] truncate font-mono" style={{ color: PALETTE.secondary }}>
              {node.schema} &bull; {node.columns?.length || 0} cols
            </div>
          </div>
        </div>

        {/* Action Menu Items */}
        <div className="py-1">
          <button
            onClick={() => onInspect(node.id)}
            className="w-full px-3 py-2 text-left text-xs font-semibold flex items-center gap-2.5 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ color: PALETTE.primary }}
          >
            <span>&#x1F50D;</span>
            <span>Inspect Table &amp; Columns</span>
          </button>

          <button
            onClick={() => onFocus(node.id)}
            className="w-full px-3 py-1.5 text-left text-xs font-medium flex items-center gap-2.5 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ color: PALETTE.textPrimary }}
          >
            <span>&#x1F3AF;</span>
            <span>{focusedNodeId === node.id ? 'Exit Focus Mode' : 'Focus Neighborhood (1-hop)'}</span>
          </button>

          <div className="my-1 border-t" style={{ borderColor: PALETTE.border }} />

          <button
            onClick={() => {
              navigator.clipboard.writeText(node.table);
              showToast(`Copied "${node.table}" to clipboard`);
              onClose();
            }}
            className="w-full px-3 py-1.5 text-left text-xs font-medium flex items-center gap-2.5 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ color: PALETTE.textPrimary }}
          >
            <span>&#x1F4CB;</span>
            <span>Copy Table Name</span>
          </button>

          <button
            onClick={() => {
              const sql = `SELECT * FROM "${node.schema}"."${node.table}" LIMIT 50;`;
              navigator.clipboard.writeText(sql);
              showToast('Copied SELECT SQL to clipboard');
              onClose();
            }}
            className="w-full px-3 py-1.5 text-left text-xs font-medium flex items-center gap-2.5 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ color: PALETTE.textPrimary }}
          >
            <span>&#x26A1;</span>
            <span>Copy SELECT Query</span>
          </button>

          <div className="my-1 border-t" style={{ borderColor: PALETTE.border }} />

          <button
            onClick={() => onHide(node.id)}
            className="w-full px-3 py-1.5 text-left text-xs font-medium flex items-center gap-2.5 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
          >
            <span>&#x2715;</span>
            <span>Hide Table</span>
          </button>
        </div>
      </div>
    </>
  );
}

function TableInspectorModal({
  nodeId,
  graphData,
  inspectedTab,
  setInspectedTab,
  inspectorSearch,
  setInspectorSearch,
  onClose,
  onJumpToNode,
  onFocusNode,
  focusedNodeId,
  showToast,
}) {
  const node = graphData?.nodes?.find((n) => n.id === nodeId);
  if (!node) return null;

  const outgoingEdges = useMemo(() => {
    if (!graphData) return [];
    return graphData.edges.filter((e) => e.source === nodeId);
  }, [graphData, nodeId]);

  const incomingEdges = useMemo(() => {
    if (!graphData) return [];
    return graphData.edges.filter((e) => e.target === nodeId);
  }, [graphData, nodeId]);

  const totalLinks = outgoingEdges.length + incomingEdges.length;

  const filteredColumns = useMemo(() => {
    const q = inspectorSearch.toLowerCase().trim();
    if (!q) return node.columns || [];
    return (node.columns || []).filter(
      (c) => c.name.toLowerCase().includes(q) || (c.type && c.type.toLowerCase().includes(q))
    );
  }, [node.columns, inspectorSearch]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ backgroundColor: PALETTE.panel, borderColor: PALETTE.border }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: PALETTE.border, backgroundColor: PALETTE.background }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x1F5C3;</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold" style={{ color: PALETTE.textPrimary }}>
                  {node.table}
                </h3>
                <span
                  className="text-xs px-2 py-0.5 rounded font-mono"
                  style={{ backgroundColor: PALETTE.primary + '18', color: PALETTE.primary }}
                >
                  {node.schema}
                </span>
              </div>
              <div className="text-xs flex items-center gap-3 mt-1" style={{ color: PALETTE.secondary }}>
                <span>{node.columns?.length || 0} Columns</span>
                <span>&bull;</span>
                <span>{totalLinks} Foreign Key Relationships</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onFocusNode(node.id)}
              className="px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors cursor-pointer border"
              style={{
                borderColor: focusedNodeId === node.id ? PALETTE.chartAmber : PALETTE.border,
                color: focusedNodeId === node.id ? PALETTE.chartAmber : PALETTE.textPrimary,
                backgroundColor: focusedNodeId === node.id ? PALETTE.chartAmber + '20' : 'transparent',
              }}
            >
              <span>🎯</span>
              <span>{focusedNodeId === node.id ? 'Exit Focus' : 'Focus'}</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-base"
              style={{ color: PALETTE.textPrimary }}
            >
              &#x2715;
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b px-6" style={{ borderColor: PALETTE.border }}>
          <button
            onClick={() => setInspectedTab('columns')}
            className="py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2"
            style={{
              borderColor: inspectedTab === 'columns' ? PALETTE.primary : 'transparent',
              color: inspectedTab === 'columns' ? PALETTE.primary : PALETTE.secondary,
            }}
          >
            <span>📋</span>
            <span>Columns ({node.columns?.length || 0})</span>
          </button>

          <button
            onClick={() => setInspectedTab('relations')}
            className="py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2"
            style={{
              borderColor: inspectedTab === 'relations' ? PALETTE.primary : 'transparent',
              color: inspectedTab === 'relations' ? PALETTE.primary : PALETTE.secondary,
            }}
          >
            <span>🔗</span>
            <span>Relationships ({totalLinks})</span>
          </button>

          <button
            onClick={() => setInspectedTab('sql')}
            className="py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2"
            style={{
              borderColor: inspectedTab === 'sql' ? PALETTE.primary : 'transparent',
              color: inspectedTab === 'sql' ? PALETTE.primary : PALETTE.secondary,
            }}
          >
            <span>⚡</span>
            <span>SQL Templates</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: Columns */}
          {inspectedTab === 'columns' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <input
                  type="text"
                  placeholder="Filter columns by name or type..."
                  value={inspectorSearch}
                  onChange={(e) => setInspectorSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border flex-1 outline-none transition-colors"
                  style={{
                    backgroundColor: PALETTE.background,
                    borderColor: PALETTE.border,
                    color: PALETTE.textPrimary,
                  }}
                />
                <span className="text-xs font-mono" style={{ color: PALETTE.secondary }}>
                  Showing {filteredColumns.length} of {node.columns?.length || 0}
                </span>
              </div>

              <div className="border rounded-xl overflow-hidden" style={{ borderColor: PALETTE.border }}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr style={{ backgroundColor: PALETTE.background, color: PALETTE.secondary }}>
                      <th className="py-2.5 px-3 font-semibold w-10">#</th>
                      <th className="py-2.5 px-3 font-semibold">Column Name</th>
                      <th className="py-2.5 px-3 font-semibold">Data Type</th>
                      <th className="py-2.5 px-3 font-semibold">Key / Nullable</th>
                      <th className="py-2.5 px-3 font-semibold">Details / Enums</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredColumns.map((col, idx) => (
                      <tr
                        key={col.name}
                        className="border-t hover:bg-white/[0.02] transition-colors"
                        style={{ borderColor: PALETTE.border }}
                      >
                        <td className="py-2 px-3 font-mono" style={{ color: PALETTE.secondary }}>
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-bold" style={{ color: PALETTE.textPrimary }}>
                          <div className="flex items-center gap-1.5">
                            {col.is_pk && <span title="Primary Key">&#x1F511;</span>}
                            {col.is_fk && <span title="Foreign Key" style={{ color: PALETTE.chartBlue }}>&#x1F517;</span>}
                            <span>{col.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]" style={{ color: PALETTE.chartBlue }}>
                          {col.type || 'text'}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            {col.is_pk && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                style={{ backgroundColor: PALETTE.chartAmber + '25', color: PALETTE.chartAmber }}
                              >
                                PK
                              </span>
                            )}
                            {col.is_fk && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                style={{ backgroundColor: PALETTE.chartBlue + '25', color: PALETTE.chartBlue }}
                              >
                                FK
                              </span>
                            )}
                            {col.not_null ? (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                style={{ backgroundColor: PALETTE.chartEmerald + '20', color: PALETTE.chartEmerald }}
                              >
                                NOT NULL
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{ color: PALETTE.secondary }}>
                                nullable
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          {col.enum_values && col.enum_values.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {col.enum_values.map((val) => (
                                <span
                                  key={val}
                                  className="px-1.5 py-0.2 rounded-full text-[9px] font-mono"
                                  style={{ backgroundColor: PALETTE.chartViolet + '20', color: PALETTE.chartViolet }}
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: PALETTE.secondary }}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Relationships */}
          {inspectedTab === 'relations' && (
            <div className="flex flex-col gap-6">
              {/* Outgoing Foreign Keys */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: PALETTE.chartBlue }}>
                  <span>↗ Outgoing References</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px]" style={{ backgroundColor: PALETTE.chartBlue + '20' }}>
                    {outgoingEdges.length}
                  </span>
                </h4>

                {outgoingEdges.length === 0 ? (
                  <div className="p-4 rounded-xl border text-xs text-center" style={{ borderColor: PALETTE.border, color: PALETTE.secondary }}>
                    This table has no outgoing foreign key references.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {outgoingEdges.map((e) => (
                      <div
                        key={e.id || `${e.source}_${e.target}`}
                        className="p-3 rounded-xl border flex items-center justify-between gap-4 transition-colors"
                        style={{ backgroundColor: PALETTE.background, borderColor: PALETTE.border }}
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold" style={{ color: PALETTE.textPrimary }}>
                            {e.source_column || 'id'}
                          </span>
                          <span style={{ color: PALETTE.chartBlue }}>&rarr;</span>
                          <span className="font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: PALETTE.primary + '18', color: PALETTE.primary }}>
                            {e.target}
                          </span>
                          <span className="font-mono text-[11px]" style={{ color: PALETTE.secondary }}>
                            ({e.target_column || 'id'})
                          </span>
                          {e.relationship_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: PALETTE.border, color: PALETTE.secondary }}>
                              {e.relationship_type}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              onJumpToNode(e.target);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs font-bold rounded border hover:bg-white/10 transition-colors cursor-pointer"
                            style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                            title="Jump and center view on this table"
                          >
                            👁 Jump
                          </button>
                          <button
                            onClick={() => {
                              onFocusNode(e.target);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs font-bold rounded border hover:bg-white/10 transition-colors cursor-pointer"
                            style={{ borderColor: PALETTE.chartAmber, color: PALETTE.chartAmber }}
                            title="Focus on this referenced table"
                          >
                            🎯 Focus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Incoming References */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: PALETTE.chartEmerald }}>
                  <span>↙ Incoming References (Referenced By)</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px]" style={{ backgroundColor: PALETTE.chartEmerald + '20' }}>
                    {incomingEdges.length}
                  </span>
                </h4>

                {incomingEdges.length === 0 ? (
                  <div className="p-4 rounded-xl border text-xs text-center" style={{ borderColor: PALETTE.border, color: PALETTE.secondary }}>
                    No other tables reference this table.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {incomingEdges.map((e) => (
                      <div
                        key={e.id || `${e.source}_${e.target}`}
                        className="p-3 rounded-xl border flex items-center justify-between gap-4 transition-colors"
                        style={{ backgroundColor: PALETTE.background, borderColor: PALETTE.border }}
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: PALETTE.primary + '18', color: PALETTE.primary }}>
                            {e.source}
                          </span>
                          <span className="font-mono text-[11px]" style={{ color: PALETTE.secondary }}>
                            ({e.source_column || 'id'})
                          </span>
                          <span style={{ color: PALETTE.chartEmerald }}>&rarr;</span>
                          <span className="font-mono font-bold" style={{ color: PALETTE.textPrimary }}>
                            {e.target_column || 'id'}
                          </span>
                          {e.relationship_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: PALETTE.border, color: PALETTE.secondary }}>
                              {e.relationship_type}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              onJumpToNode(e.source);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs font-bold rounded border hover:bg-white/10 transition-colors cursor-pointer"
                            style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                            title="Jump and center view on this table"
                          >
                            👁 Jump
                          </button>
                          <button
                            onClick={() => {
                              onFocusNode(e.source);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs font-bold rounded border hover:bg-white/10 transition-colors cursor-pointer"
                            style={{ borderColor: PALETTE.chartAmber, color: PALETTE.chartAmber }}
                            title="Focus on this referencing table"
                          >
                            🎯 Focus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SQL Templates */}
          {inspectedTab === 'sql' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold" style={{ color: PALETTE.textPrimary }}>
                  Sample Select Query
                </span>
                <div
                  className="p-3 rounded-xl border font-mono text-xs flex items-center justify-between"
                  style={{ backgroundColor: PALETTE.background, borderColor: PALETTE.border }}
                >
                  <code style={{ color: PALETTE.chartBlue }}>
                    SELECT * FROM "{node.schema}"."{node.table}" LIMIT 50;
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`SELECT * FROM "${node.schema}"."${node.table}" LIMIT 50;`);
                      showToast('Copied SELECT query to clipboard');
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded border hover:bg-white/10 transition-colors cursor-pointer ml-3"
                    style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold" style={{ color: PALETTE.textPrimary }}>
                  Count Rows Query
                </span>
                <div
                  className="p-3 rounded-xl border font-mono text-xs flex items-center justify-between"
                  style={{ backgroundColor: PALETTE.background, borderColor: PALETTE.border }}
                >
                  <code style={{ color: PALETTE.chartEmerald }}>
                    SELECT COUNT(*) AS total_rows FROM "{node.schema}"."{node.table}";
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`SELECT COUNT(*) AS total_rows FROM "${node.schema}"."${node.table}";`);
                      showToast('Copied COUNT query to clipboard');
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded border hover:bg-white/10 transition-colors cursor-pointer ml-3"
                    style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold" style={{ color: PALETTE.textPrimary }}>
                  Inspect Schema Metadata
                </span>
                <div
                  className="p-3 rounded-xl border font-mono text-xs flex items-center justify-between"
                  style={{ backgroundColor: PALETTE.background, borderColor: PALETTE.border }}
                >
                  <code style={{ color: PALETTE.chartViolet }}>
                    SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '{node.table}';
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${node.table}';`);
                      showToast('Copied Schema query to clipboard');
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded border hover:bg-white/10 transition-colors cursor-pointer ml-3"
                    style={{ borderColor: PALETTE.border, color: PALETTE.textPrimary }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
