import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";

import type { Node, Edge } from "@xyflow/react";
import * as React from "react";
import "@xyflow/react/dist/style.css";

function TeamNode({ data }: any) {
  return (
    <div
      style={{
        minWidth: 260,
        background: "white",
        border: "2px solid #444",
        borderRadius: 6,
        overflow: "hidden",
        fontFamily: "Segoe UI",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div
        style={{
          padding: 10,
          fontWeight: 600,
          background: "#f3f3f3",
          borderBottom: "1px solid #ccc",
        }}
      >
        {data.teamName}
      </div>

      <div
        style={{
          fontSize: 12,
          color: "#666",
          padding: "6px 10px",
          borderBottom: "1px solid #ccc",
        }}
      >
        {data.members.length} Employees
      </div>

      <div style={{ padding: 10 }}>
        {data.members.map((m: string, i: number) => {
          const isVacant = m === "Vacant";
          return (
            <div
              key={`${m}-${i}`}
              style={{
                padding: "4px 0",
                color: isVacant ? "#999" : "inherit",
                fontStyle: isVacant ? "italic" : "normal",
              }}
            >
              {isVacant ? "— Vacant —" : m}
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function GroupNode({ data }: any) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 12,
          fontFamily: "Segoe UI",
          fontWeight: 700,
          fontSize: 160,
          color: "#2e7d32",
          letterSpacing: 0.5,
        }}
      >
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes = {
  teamNode: TeamNode,
  groupNode: GroupNode,
};

interface AppProps {
  initialNodes: Node[];
  initialEdges: Edge[];
}

export default function App1({ initialNodes, initialEdges }: AppProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null);

  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const dragState = React.useRef<{
    ctrl: boolean;
    rootStart: { x: number; y: number };
    descendants: { id: string; start: { x: number; y: number } }[];
  } | null>(null);

  // Find all descendant node ids of a given node by walking edges downward.
  const getDescendants = React.useCallback((rootId: string): string[] => {
    const childrenOf: Record<string, string[]> = {};
    edges.forEach((e) => {
      (childrenOf[e.source] = childrenOf[e.source] || []).push(e.target);
    });
    const result: string[] = [];
    const stack = [...(childrenOf[rootId] || [])];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      (childrenOf[id] || []).forEach((c) => stack.push(c));
    }
    return result;
  }, [edges]);

  const onNodeDragStart = React.useCallback(
    (event: MouseEvent | TouchEvent, node: Node) => {
      const ctrl = "ctrlKey" in event ? (event.ctrlKey || event.metaKey) : false;
      if (!ctrl) {
        dragState.current = null;
        return;
      }
      const descIds = getDescendants(node.id);
      const descSet = new Set(descIds);
      dragState.current = {
        ctrl: true,
        rootStart: { ...node.position },
        descendants: nodes
          .filter((n) => descSet.has(n.id))
          .map((n) => ({ id: n.id, start: { ...n.position } })),
      };
    },
    [getDescendants, nodes]
  );

  const onNodeDrag = React.useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const st = dragState.current;
      if (!st || !st.ctrl) return;
      const dx = node.position.x - st.rootStart.x;
      const dy = node.position.y - st.rootStart.y;
      setNodes((nds) =>
        nds.map((n) => {
          const d = st.descendants.find((x) => x.id === n.id);
          if (!d) return n;
          return { ...n, position: { x: d.start.x + dx, y: d.start.y + dy } };
        })
      );
    },
    [setNodes]
  );

  const onNodeDragStop = React.useCallback(() => {
    dragState.current = null;
  }, []);

  const onNodeClick = React.useCallback((_e: React.MouseEvent, node: Node) => {
    // Ignore clicks on the bureau group boxes.
    if (node.type === "groupNode") return;
    setSelectedNode(node);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{
          padding: 0.2,
        }}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        nodesDraggable
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>

      {selectedNode && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 320,
            height: "100%",
            background: "white",
            borderLeft: "2px solid #444",
            boxShadow: "-2px 0 8px rgba(0,0,0,0.15)",
            padding: 20,
            fontFamily: "Segoe UI",
            overflowY: "auto",
            zIndex: 10,
            boxSizing: "border-box",
          }}
        >
          <button
            onClick={() => setSelectedNode(null)}
            style={{
              float: "right",
              border: "none",
              background: "transparent",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>

          <h3 style={{ marginTop: 0, marginBottom: 4 }}>
            {(selectedNode.data as any).teamName}
          </h3>

          <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
            {(selectedNode.data as any).members?.length ?? 0} Employees
          </div>

          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Team Info
          </div>
          <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {(selectedNode.data as any).teamInfo || "No information available."}
          </div>
        </div>
      )}
    </div>
  );
}