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
const MAX_BUREAU_COLS = 6; // max team nodes per row inside a bureau box (wraps wider ones)
const CHILD_GAP_X = 40; // horizontal gap between wrapped child nodes
const CHILD_GAP_Y = 40; // vertical gap between wrapped child rows

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
 * Lay out a single bureau's members and return the positioned member nodes
 * (relative to 0,0 of their sub-layout) plus the sub-layout's width/height.
 *
 * Structure is 2 layers: root team(s) on top, child teams below. To keep wide
 * bureaus (many children) from becoming one very long row, children are
 * wrapped into a grid of at most MAX_BUREAU_COLS per row.
 */
function layoutOneBureau(
  members: OrgNode[],
  edges: OrgEdge[]
): { nodes: OrgNode[]; width: number; height: number } {
  const memberIds = new Set(members.map((m) => m.id));
  const internalEdges = edges.filter(
    (e) => memberIds.has(e.source) && memberIds.has(e.target)
  );

  // Identify children (any node that is a target of an internal edge) vs roots.
  const childIds = new Set(internalEdges.map((e) => e.target));
  const roots = members.filter((m) => !childIds.has(m.id));
  const children = members.filter((m) => childIds.has(m.id));

  const contentW = GROUP_PAD; // running left edge for placement
  const positioned: OrgNode[] = [];

  // --- Roots row: place root(s) across the top, left to right. ---
  let rootX = GROUP_PAD;
  const rootY = GROUP_PAD + GROUP_TITLE_H;
  let rootRowH = 0;
  roots.forEach((r) => {
    const h = nodeHeight(r.data.members.length);
    positioned.push({ ...r, position: { x: rootX, y: rootY } });
    rootX += NODE_W + CHILD_GAP_X;
    rootRowH = Math.max(rootRowH, h);
  });

  // --- Children grid: wrap into rows of at most MAX_BUREAU_COLS. ---
  const cols = Math.min(children.length || 1, MAX_BUREAU_COLS);
  const childTop = rootY + rootRowH + CHILD_GAP_Y * 2;

  // Row heights (children in a row can vary in height).
  const childRowCount = Math.ceil(children.length / cols);
  const childRowH: number[] = [];
  for (let r = 0; r < childRowCount; r++) {
    let h = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < children.length) h = Math.max(h, nodeHeight(children[idx].data.members.length));
    }
    childRowH.push(h);
  }
  const childRowY: number[] = [];
  let accY = childTop;
  for (let r = 0; r < childRowCount; r++) {
    childRowY.push(accY);
    accY += childRowH[r] + CHILD_GAP_Y;
  }

  children.forEach((child, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    positioned.push({
      ...child,
      position: {
        x: GROUP_PAD + c * (NODE_W + CHILD_GAP_X),
        y: childRowY[r],
      },
    });
  });

  // Overall box size.
  const usedCols = Math.max(roots.length, cols, 1);
  const width = GROUP_PAD * 2 + usedCols * NODE_W + (usedCols - 1) * CHILD_GAP_X;
  const height = (children.length > 0 ? accY - CHILD_GAP_Y : rootY + rootRowH) + GROUP_PAD;

  void contentW;
  return { nodes: positioned, width, height };
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
    // Track which positions are filled so we can mark the rest "Vacant".
    const filledPositions = new Set<string>();
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
      if (posShortId) filledPositions.add(posShortId);
      (map[teamId] = map[teamId] || []).push(name);
    }

    // Vacant positions: any position not filled by an employee gets a "Vacant"
    // entry on its team.
    let vacantCount = 0;
    for (const id of posDs.sortedRecordIds) {
      const shortId = norm(id);
      if (filledPositions.has(shortId)) continue;
      const teamGuid = posToTeam[shortId];
      const teamId = teamGuid ? guidToNodeId[teamGuid] : null;
      if (!teamId) continue;
      (map[teamId] = map[teamId] || []).push("Vacant");
      vacantCount++;
    }

    console.log(`chain funnel -> hadName:${hadName} hadPosRef:${hadPosRef} hadPosMatch:${hadPosMatch} hadTeamMatch:${hadTeamMatch}`);
    console.log(`posToTeam keys: ${Object.keys(posToTeam).length}, posGuidToShortId keys: ${Object.keys(posGuidToShortId).length}, vacantPositions: ${vacantCount}`);
    console.log(`membersByTeam keys built: ${Object.keys(map).length}`);
    return map;
  }

  private render(): void {
    console.log("=== OrgChart BUILD #33 ===");
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

    // Log bureau distribution so we can confirm matching.
    const bureauCounts: Record<string, number> = {};
    positioned.forEach((n) => {
      const b = n._bureau || "(none)";
      bureauCounts[b] = (bureauCounts[b] || 0) + 1;
    });
    console.log("Bureau counts:", JSON.stringify(bureauCounts));

    // Decide layout mode: if any teams match one of the known bureaus, use the
    // grouped (boxed) layout; otherwise render a plain flat hierarchy. This lets
    // the same control serve the bureau-grouped PAM directorate AND the flat
    // BIO directorate without configuration.
    const knownBureauNames = new Set(BUREAUS.map((b) => b.name));
    const anyBureau = positioned.some((n) => n._bureau && knownBureauNames.has(n._bureau));

    const grouped = anyBureau
      ? wrapAllBureaus(positioned, edges)
      : positioned.map(stripTag); // flat: dagre layout already applied

    console.log(`layout mode: ${anyBureau ? "grouped (bureaus)" : "flat"}`);

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