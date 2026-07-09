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
const normName = (s: string) => s.trim().toLowerCase();

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

    const datasets = [
      context.parameters.sampleDataSet,
      context.parameters.positionsDataSet,
      context.parameters.employeesDataSet
    ];

    // Bump page size on every dataset so we pull large batches, not 25 at a time.
    for (const ds of datasets) {
      if (ds && ds.paging && typeof ds.paging.setPageSize === "function") {
        ds.paging.setPageSize(5000);
      }
    }

    // If ANY dataset still has more pages, load the next and wait.
    // loadNextPage triggers another updateView, so we return early and
    // render only once all three are fully loaded.
    for (const ds of datasets) {
      if (ds && ds.paging && ds.paging.hasNextPage) {
        ds.paging.loadNextPage();
        return;
      }
    }

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

    // Diagnostics
    console.log("POS dataset count:", posDs.sortedRecordIds.length);
    console.log("POS columns:", posDs.columns.map((c) => c.name));
    console.log("EMP dataset count:", empDs.sortedRecordIds.length);
    console.log("EMP columns:", empDs.columns.map((c) => c.name));

    // Resolve flat columns case-insensitively (added via AddColumns in Power Fx).
    const posGuidCol = posDs.columns.find((c) => c.name && c.name.toLowerCase() === "positionguid")?.name;
    const posTeamCol = posDs.columns.find((c) => c.name && c.name.toLowerCase() === "posteamid")?.name;
    const empNameCol = empDs.columns.find((c) => c.name && c.name.toLowerCase() === "empname")?.name;
    const empPosCol  = empDs.columns.find((c) => c.name && c.name.toLowerCase() === "emppositionid")?.name;

    console.log("Resolved POS cols:", { posGuidCol, posTeamCol });
    console.log("Resolved EMP cols:", { empNameCol, empPosCol });

    // positionGuid -> teamGuid
    const posToTeam: Record<string, string> = {};
    if (posGuidCol && posTeamCol) {
      for (const id of posDs.sortedRecordIds) {
        const rec = posDs.records[id];
        const posGuid = norm((rec.getValue(posGuidCol) as string) || "");
        const teamGuid = norm((rec.getValue(posTeamCol) as string) || "");
        if (posGuid && teamGuid) posToTeam[posGuid] = teamGuid;
      }
    }

    // employee -> position -> team
    if (empNameCol && empPosCol) {
      for (const id of empDs.sortedRecordIds) {
        const rec = empDs.records[id];
        const name = rec.getFormattedValue(empNameCol) || (rec.getValue(empNameCol) as string) || "";
        const posGuid = norm((rec.getValue(empPosCol) as string) || "");
        const teamGuid = posGuid ? posToTeam[posGuid] : null;
        if (!name || !teamGuid) continue;
        (map[teamGuid] = map[teamGuid] || []).push(name);
      }
    }

    console.log("posToTeam entries:", Object.keys(posToTeam).length);
    console.log("membersByTeam teams populated:", Object.keys(map).length);

    return map;
  }

  private render(): void {
    const dataset = this.context.parameters.sampleDataSet;
    const membersByTeam = this.buildMembersByTeam();

    // Diagnostic: which columns is the Teams dataset actually delivering?
    console.log("Teams columns:", dataset.columns.map((c) => c.name));

    // Resolve the flat parent-id column we added in Power Fx via AddColumns.
    const parentIdCol = dataset.columns.find(
      (c) => c.name.toLowerCase() === "parentteamid"
    )?.name;

    // Also resolve the flat parent-name column (useful for debugging/fallback).
    const parentNameCol = dataset.columns.find(
      (c) => c.name.toLowerCase() === "parentteamname"
    )?.name;

    console.log("Resolved parentIdCol:", parentIdCol, "| parentNameCol:", parentNameCol);

    // ONE-TIME deep dump of the first record so we can see the true shape
    // of every field and every accessor available on it.
    const firstId = dataset.sortedRecordIds[0];
    if (firstId) {
      const r = dataset.records[firstId];
      console.log("FULL COLUMN META:", JSON.stringify(dataset.columns, null, 2));
      console.log("RECORD KEYS:", Object.keys(r));
      console.log("sample node id (normalized):", norm(firstId));
      if (parentIdCol) {
        console.log("sample parentId getValue:", r.getValue(parentIdCol));
        console.log("sample parentId (normalized):", norm((r.getValue(parentIdCol) as string) || ""));
      }
      if (parentNameCol) {
        console.log("sample parentName getValue:", r.getValue(parentNameCol));
        console.log("sample parentName getFormatted:", r.getFormattedValue(parentNameCol));
      }
      // some hosts expose raw fields under _record / fields
      console.log("RAW RECORD:", JSON.stringify(r, (k, v) => (k.startsWith("_") ? undefined : v), 2));
    }

    // Resolve the team's OWN guid column (added via AddColumns as "TeamGuid").
    // The dataset row id is a sequential integer on a collection/canvas binding,
    // so we must key nodes by the real team GUID to match parentId GUIDs.
    const teamGuidCol = dataset.columns.find(
      (c) => c.name.toLowerCase() === "teamguid"
    )?.name;

    console.log("Resolved teamGuidCol:", teamGuidCol);

    // Map each dataset row id -> that team's GUID, so edges can reference it.
    const rowToGuid: Record<string, string> = {};

    const nodes = dataset.sortedRecordIds.map((id: string, index: number) => {
      const record = dataset.records[id];
      const teamGuid = teamGuidCol
        ? norm((record.getValue(teamGuidCol) as string) || "")
        : norm(id); // fallback to row id if TeamGuid missing
      rowToGuid[id] = teamGuid;

      const teamName = record.getFormattedValue("pam_team");
      return {
        id: teamGuid, // key node by the real team GUID
        type: "teamNode",
        position: { x: index * 300, y: 100 },
        data: {
          teamName: teamName,
          members: membersByTeam[teamGuid] || []
        }
      };
    });

    // Match child -> parent by GUID, which is unique (unlike names).
    const edges = dataset.sortedRecordIds
      .map((id: string) => {
        const record = dataset.records[id];
        const childGuid = rowToGuid[id];
        const rawParentId = parentIdCol
          ? (record.getValue(parentIdCol) as string | null)
          : null;

        console.log(
          "parent debug:",
          "childGuid:", childGuid,
          "rawParentId:", JSON.stringify(rawParentId)
        );

        if (!rawParentId) return null;
        const parentKey = norm(rawParentId);

        return {
          id: `e-${childGuid}`,
          source: parentKey,
          target: childGuid,
          animated: true
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

    console.log(`EDGES BUILT: ${edges.length} (out of ${dataset.sortedRecordIds.length} teams)`);

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