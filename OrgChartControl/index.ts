import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import * as dagre from "dagre";
import App1 from "../src/App";

const NODE_W = 260;

// Shape of a node as it flows through this file (pre-render).
interface OrgNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { teamName: string; members: string[]; label?: string };
  style?: Record<string, string | number>;
  parentId?: string;
  extent?: "parent";
  _bureau?: string | null;
}

interface OrgEdge {
  id: string;
  source: string;
  target: string;
  animated: boolean;
}

function nodeHeight(memberCount: number): number {
  return 40 + 28 + 20 + memberCount * 24;
}

function layoutNodes(nodes: OrgNode[], edges: { source: string; target: string }[]): OrgNode[] {
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

const GROUP_PAD = 40; // space between the group border and the nodes inside
const GROUP_TITLE_H = 40; // height reserved at the top of the box for the label
const GROUP_GAP = 60; // gap between adjacent bureau boxes in the grid
const GRID_COLS = 3; // bureau boxes per row (3 x 3 fits 8 with room to spare)

// The 8 bureaus, each with a fill + border color. Order = grid placement order.
const BUREAUS: { name: string; fill: string; border: string; title: string }[] = [
  { name: "USGS", fill: "rgba(76, 175, 80, 0.15)",  border: "#4caf50", title: "#2e7d32" },
  { name: "NPS",  fill: "rgba(33, 150, 243, 0.15)", border: "#2196f3", title: "#1565c0" },
  { name: "FWS",  fill: "rgba(156, 39, 176, 0.15)", border: "#9c27b0", title: "#6a1b9a" },
  { name: "WF",   fill: "rgba(255, 152, 0, 0.15)",  border: "#ff9800", title: "#e65100" },
  { name: "BOR",  fill: "rgba(0, 150, 136, 0.15)",  border: "#009688", title: "#00695c" },
  { name: "BLM",  fill: "rgba(121, 85, 72, 0.15)",  border: "#795548", title: "#4e342e" },
  { name: "PAM",  fill: "rgba(233, 30, 99, 0.15)",  border: "#e91e63", title: "#ad1457" },
  { name: "BBO",  fill: "rgba(96, 125, 139, 0.15)", border: "#607d8b", title: "#37474f" },
];

/**
 * Lay out a single bureau's members with their own dagre pass and return the
 * positioned member nodes (relative to 0,0 of their sub-layout) plus the
 * sub-layout's width/height.
 */
function layoutOneBureau(
  members: OrgNode[],
  edges: OrgEdge[]
): { nodes: OrgNode[]; width: number; height: number } {
  const memberIds = new Set(members.map((m) => m.id));
  const internalEdges = edges.filter(
    (e) => memberIds.has(e.source) && memberIds.has(e.target)
  );

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });
  members.forEach((m) => {
    g.setNode(m.id, { width: NODE_W, height: nodeHeight(m.data.members.length) });
  });
  internalEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  members.forEach((m) => {
    const p = g.node(m.id);
    const h = nodeHeight(m.data.members.length);
    minX = Math.min(minX, p.x - NODE_W / 2);
    minY = Math.min(minY, p.y - h / 2);
    maxX = Math.max(maxX, p.x + NODE_W / 2);
    maxY = Math.max(maxY, p.y + h / 2);
  });

  // Positions relative to the sub-layout origin, shifted below the title bar.
  const positioned = members.map((m) => {
    const p = g.node(m.id);
    const h = nodeHeight(m.data.members.length);
    return {
      ...m,
      position: {
        x: p.x - NODE_W / 2 - minX + GROUP_PAD,
        y: p.y - h / 2 - minY + GROUP_PAD + GROUP_TITLE_H,
      },
    };
  });

  return {
    nodes: positioned,
    width: maxX - minX + GROUP_PAD * 2,
    height: maxY - minY + GROUP_PAD * 2 + GROUP_TITLE_H,
  };
}

/**
 * Wrap every bureau's teams in its own colored box, tiling the boxes in a grid
 * so they don't overlap. Boxes are sized to their own content; each grid row's
 * height is the tallest box in that row, each column's x is based on the widest
 * box to its left.
 */
function wrapAllBureaus(nodes: OrgNode[], edges: OrgEdge[]): OrgNode[] {
  // First pass: lay out each bureau and measure it.
  const laidOut = BUREAUS.map((b) => {
    const members = nodes.filter((n) => n._bureau === b.name);
    if (members.length === 0) return null;
    const result = layoutOneBureau(members, edges);
    return { bureau: b, ...result };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Compute grid cell positions. Column widths = max width in that column;
  // row heights = max height in that row.
  const colWidths: number[] = [];
  const rowHeights: number[] = [];
  laidOut.forEach((item, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    colWidths[col] = Math.max(colWidths[col] || 0, item.width);
    rowHeights[row] = Math.max(rowHeights[row] || 0, item.height);
  });

  // Cumulative offsets for each column/row.
  const colX: number[] = [];
  let accX = 0;
  for (let c = 0; c < colWidths.length; c++) {
    colX[c] = accX;
    accX += colWidths[c] + GROUP_GAP;
  }
  const rowY: number[] = [];
  let accY = 0;
  for (let r = 0; r < rowHeights.length; r++) {
    rowY[r] = accY;
    accY += rowHeights[r] + GROUP_GAP;
  }

  const out: OrgNode[] = [];
  laidOut.forEach((item, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const groupId = `group-${item.bureau.name.toLowerCase()}`;

    out.push({
      id: groupId,
      type: "groupNode",
      position: { x: colX[col], y: rowY[row] },
      data: { teamName: "", members: [], label: item.bureau.name },
      style: {
        width: item.width,
        height: item.height,
        backgroundColor: item.bureau.fill,
        border: `2px solid ${item.bureau.border}`,
        borderRadius: 12,
      },
    });

    // Children reference the group and keep their sub-layout positions.
    item.nodes.forEach((n) => {
      out.push(
        stripTag({
          ...n,
          parentId: groupId,
          extent: "parent",
        })
      );
    });
  });

  return out;
}

function stripTag(n: OrgNode): OrgNode {
  const rest = { ...n };
  delete rest._bureau;
  return rest;
}

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
    const teams = context.parameters.sampleDataSet;
    const positions = context.parameters.positionsDataSet;
    const employees = context.parameters.employeesDataSet;

    // Skip early renders where a dataset is still loading / empty.
    if (teams.loading || teams.sortedRecordIds.length === 0) return;

    // Page through every dataset before rendering the full set.
    if (teams.paging && teams.paging.hasNextPage) {
      teams.paging.loadNextPage();
      return;
    }
    if (positions.paging && positions.paging.hasNextPage) {
      positions.paging.loadNextPage();
      return;
    }
    if (employees.paging && employees.paging.hasNextPage) {
      employees.paging.loadNextPage();
      return;
    }

    this.render();
  }

  /**
   * Build teamNodeId -> [employee names] by chaining
   * Employee -> Position -> Team across three datasets.
   *
   * Note: on the canvas host, dataset record ids are short synthetic keys
   * (e.g. "5637"), while lookups return full GUIDs. We bridge the two id
   * spaces with guid->shortId maps.
   */
  private buildMembersByTeam(guidToNodeId: Record<string, string>): Record<string, string[]> {
    const posDs = this.context.parameters.positionsDataSet;
    const empDs = this.context.parameters.employeesDataSet;
    const map: Record<string, string[]> = {};

    // Resolve column names case-insensitively (host delivers mixed case).
    const findCol = (
      ds: ComponentFramework.PropertyTypes.DataSet,
      target: string
    ): string | undefined =>
      ds.columns.find(
        (c: ComponentFramework.PropertyHelper.DataSetApi.Column) =>
          c.name.toLowerCase() === target.toLowerCase()
      )?.name;

    const posTeamCol = findCol(posDs, "posteamid");
    const posGuidCol = findCol(posDs, "positionguid");
    const empNameCol = findCol(empDs, "empname");
    const empPosCol = findCol(empDs, "emppositionid");

    console.log("resolved cols -> posTeamCol:", posTeamCol, "posGuidCol:", posGuidCol,
      "empNameCol:", empNameCol, "empPosCol:", empPosCol);
    console.log(`counts -> positions: ${posDs.sortedRecordIds.length}, employees: ${empDs.sortedRecordIds.length}, guidToNodeId keys: ${Object.keys(guidToNodeId).length}`);

    // A lookup value on this host may arrive as an EntityReference object
    // ({id:{guid}}) OR as a bare GUID string. Normalize both to a guid string.
    const refToGuid = (v: unknown): string | null => {
      if (!v) return null;
      if (typeof v === "string") return norm(v);
      const ref = v as ComponentFramework.EntityReference;
      if (ref.id && ref.id.guid) return norm(ref.id.guid);
      return null;
    };

    // Sample one of each to see id/value shapes.
    const pid0 = posDs.sortedRecordIds[0];
    if (pid0) {
      console.log("sample position:", pid0,
        "posTeamId raw:", posTeamCol ? JSON.stringify(posDs.records[pid0].getValue(posTeamCol)) : "(no col)",
        "positionGuid raw:", posGuidCol ? JSON.stringify(posDs.records[pid0].getValue(posGuidCol)) : "(no col)");
    }
    const eid0 = empDs.sortedRecordIds[0];
    if (eid0) {
      console.log("sample employee:", eid0,
        "name:", empNameCol ? empDs.records[eid0].getFormattedValue(empNameCol) : "(no col)",
        "posRef raw:", empPosCol ? JSON.stringify(empDs.records[eid0].getValue(empPosCol)) : "(no col)");
    }

    // positionShortId -> teamGuid, and positionGuid -> positionShortId.
    const posToTeam: Record<string, string> = {};
    const posGuidToShortId: Record<string, string> = {};
    for (const id of posDs.sortedRecordIds) {
      const rec = posDs.records[id];
      const teamGuid = posTeamCol ? refToGuid(rec.getValue(posTeamCol)) : null;
      if (teamGuid) posToTeam[norm(id)] = teamGuid;
      const pg = posGuidCol ? rec.getValue(posGuidCol) : null;
      if (pg) posGuidToShortId[norm(String(pg))] = norm(id);
    }

    // employees -> chain through position -> team
    let hadName = 0, hadPosRef = 0, hadPosMatch = 0, hadTeamMatch = 0;
    for (const id of empDs.sortedRecordIds) {
      const rec = empDs.records[id];
      const name = empNameCol ? rec.getFormattedValue(empNameCol) : null;
      const posGuid = empPosCol ? refToGuid(rec.getValue(empPosCol)) : null;
      const posShortId = posGuid ? posGuidToShortId[posGuid] : null;
      const teamGuid = posShortId ? posToTeam[posShortId] : null;
      const teamId = teamGuid ? guidToNodeId[teamGuid] : null;

      if (name) hadName++;
      if (posGuid) hadPosRef++;
      if (posShortId) hadPosMatch++;
      if (teamId) hadTeamMatch++;

      if (!name || !teamId) continue;
      (map[teamId] = map[teamId] || []).push(name);
    }

    console.log(`chain funnel -> hadName:${hadName} hadPosRef:${hadPosRef} hadPosMatch:${hadPosMatch} hadTeamMatch:${hadTeamMatch}`);
    console.log(`posToTeam keys: ${Object.keys(posToTeam).length}, posGuidToShortId keys: ${Object.keys(posGuidToShortId).length}`);
    console.log(`membersByTeam keys built: ${Object.keys(map).length}`);
    return map;
  }

  private render(): void {
    console.log("=== OrgChart BUILD #31 ===");
    const dataset = this.context.parameters.sampleDataSet;

    // Diagnostic: which columns is the Teams dataset actually delivering?
    console.log(
      "Teams columns:",
      dataset.columns.map((c: ComponentFramework.PropertyHelper.DataSetApi.Column) => c.name)
    );

    // Resolve column names case-insensitively.
    const parentCol = dataset.columns.find(
      (c: ComponentFramework.PropertyHelper.DataSetApi.Column) =>
        c.name.toLowerCase() === "pam_parentteam"
    )?.name;

    const bureauCol = dataset.columns.find(
      (c: ComponentFramework.PropertyHelper.DataSetApi.Column) =>
        c.name.toLowerCase() === "pam_originatingbureau"
    )?.name;

    // Record id is a short key; parent lookup returns a GUID. Map GUID->nodeId.
    const guidCol = dataset.columns.find(
      (c: ComponentFramework.PropertyHelper.DataSetApi.Column) =>
        c.name.toLowerCase() === "pam_teamsid" || c.name.toLowerCase() === "teamguid"
    )?.name;

    const guidToNodeId: Record<string, string> = {};
    if (guidCol) {
      dataset.sortedRecordIds.forEach((id: string) => {
        const g = dataset.records[id].getValue(guidCol);
        if (g) guidToNodeId[norm(String(g))] = norm(id);
      });
    }

    const membersByTeam = this.buildMembersByTeam(guidToNodeId);

    // Build node list.
    const nodes: OrgNode[] = dataset.sortedRecordIds.map((id: string, index: number) => {
      const record = dataset.records[id];
      const teamKey = norm(id);
      const teamName = record.getFormattedValue("pam_team");
      const bureauRaw = bureauCol ? (record.getValue(bureauCol) as string | null) : null;
      const bureau = bureauRaw ? bureauRaw.trim().toUpperCase() : null;
      return {
        id: teamKey,
        type: "teamNode",
        position: { x: index * 300, y: 100 },
        data: {
          teamName: teamName,
          members: membersByTeam[teamKey] || []
        },
        _bureau: bureau
      };
    });

    // Build edges by matching each team's parent GUID to a team node id.
    const edges: OrgEdge[] = dataset.sortedRecordIds
      .map((id: string): OrgEdge | null => {
        const record = dataset.records[id];
        const parentRef = parentCol
          ? (record.getValue(parentCol) as ComponentFramework.EntityReference | null)
          : null;
        if (!parentRef || !parentRef.id) return null;
        const sourceId = guidToNodeId[norm(parentRef.id.guid)];
        if (!sourceId) return null;
        return {
          id: `e-${norm(id)}`,
          source: sourceId,
          target: norm(id),
          animated: true
        };
      })
      .filter((edge: OrgEdge | null): edge is OrgEdge => edge !== null);

    console.log(`EDGES BUILT: ${edges.length} (out of ${dataset.sortedRecordIds.length} teams)`);

    const positioned = layoutNodes(nodes, edges);

    // Log bureau distribution so we can confirm all 8 are matching.
    const bureauCounts: Record<string, number> = {};
    positioned.forEach((n) => {
      const b = n._bureau || "(none)";
      bureauCounts[b] = (bureauCounts[b] || 0) + 1;
    });
    console.log("Bureau counts:", JSON.stringify(bureauCounts));

    const grouped = wrapAllBureaus(positioned, edges);

    this.root.render(
      React.createElement(App1, {
        initialNodes: grouped,
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