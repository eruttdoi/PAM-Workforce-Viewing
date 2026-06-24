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
        {data.members.map((m: string) => (
          <div
            key={m}
            style={{
              padding: "4px 0",
            }}
          >
            {m}
          </div>
        ))}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  teamNode: TeamNode,
};


interface AppProps {
  initialNodes: Node[];
  initialEdges: Edge[];
}

export default function App1({
  initialNodes,
  initialEdges,
}: AppProps) {
  const [nodes, setNodes, onNodesChange] =
    useNodesState(initialNodes);

  const [edges, setEdges, onEdgesChange] =
    useEdgesState(initialEdges);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
        }}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        nodesDraggable
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}