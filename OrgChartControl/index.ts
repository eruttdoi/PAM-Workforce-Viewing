import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import * as dagre from "dagre";
import App1 from "../src/App";

const NODE_W = 260;

function nodeHeight(memberCount: number): number {
  return 40 + 28 + 20 + memberCount * 24;
}

function layoutNodes<
  N extends { id: string; position: { x: number; y: number }; data: { members: string[] } },
  E extends { source: string; target: string }
>(nodes: N[], edges: E[]): N[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 100 });

  const heights: Record<string, number> = {};
  nodes.forEach((n) => {
    const h = nodeHeight(n.data.members.length);
    heights[n.id] = h;
    g.setNode(n.id, { width: NODE_W, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    const h = heights[n.id];
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - h / 2 } };
  });
}

const norm = (g: string) => g.replace(/[{}]/g, "").toLowerCase();

export class OrgChartControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private container!: HTMLDivElement;
  private root!: Root;
  private context!: ComponentFramework.Context<IInputs>;

  constructor() {
    // Empty
  }

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.container = container;
    this.root = createRoot(container);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.context = context;
    this.render();
  }

  /**
   * Build teamId -> [employee names] by chaining
   * Employee -> Position -> Team across two datasets.
   */
  private buildMembersByTeam(): Record<string, string[]> {
    const posDs = this.context.parameters.positionsDataSet;
    const empDs = this.context.parameters.employeesDataSet;
    const map: Record<string, string[]> = {};

    // positionId (record id) -> teamId
    const posToTeam: Record<string, string> = {};
    for (const id of posDs.sortedRecordIds) {
      const rec = posDs.records[id];
      const teamRef = rec.getValue("posTeamId") as ComponentFramework.EntityReference | null;
      if (teamRef && teamRef.id) {
        posToTeam[norm(id)] = norm(teamRef.id.guid);
      }
    }

    // employees -> chain through position -> team
    for (const id of empDs.sortedRecordIds) {
      const rec = empDs.records[id];
      const name = rec.getFormattedValue("empName");
      const posRef = rec.getValue("empPositionId") as ComponentFramework.EntityReference | null;
      const posId = posRef && posRef.id ? norm(posRef.id.guid) : null;
      const teamId = posId ? posToTeam[posId] : null;
      if (!name || !teamId) continue;
      (map[teamId] = map[teamId] || []).push(name);
    }

    return map;
  }

  private render(): void {
    const dataset = this.context.parameters.sampleDataSet;
    const membersByTeam = this.buildMembersByTeam();

    const nodes = dataset.sortedRecordIds.map((id: string, index: number) => {
      const record = dataset.records[id];
      const teamKey = norm(id);
      return {
        id: teamKey,
        type: "teamNode",
        position: { x: index * 300, y: 100 },
        data: {
          teamName: record.getFormattedValue("pam_team"),
          members: membersByTeam[teamKey] || []
        }
      };
    });

    const edges = dataset.sortedRecordIds
    .map((id: string) => {
        const record = dataset.records[id];
        console.log("parent raw:", id, JSON.stringify(record.getValue("pam_parentteam")));  // <-- here
        const parent = record.getValue("pam_parentteam");
        if (!parent) return null;
        const ref = parent as ComponentFramework.EntityReference;
        if (!ref.id) return null;
        return {
        id: `e-${norm(id)}`,
        source: norm(ref.id.guid),
        target: norm(id),
        animated: true
        };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

    const positioned = layoutNodes(nodes, edges);

    
    this.root.render(
      React.createElement(App1, {
        initialNodes: positioned,
        initialEdges: edges
      })
    );
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    this.root.unmount();
  }
}