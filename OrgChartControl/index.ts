import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import * as dagre from "dagre";
import App1 from "../src/App";

const NODE_W = 220;
const NODE_H = 80;

function layoutNodes<N extends { id: string; position: { x: number; y: number } }, E extends { source: string; target: string }>(nodes: N[], edges: E[]): N[] {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });
    nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
    edges.forEach(e => g.setEdge(e.source, e.target));
    dagre.layout(g);
    return nodes.map(n => {
        const p = g.node(n.id);
        return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
    });
}

const norm = (g: string) => g.replace(/[{}]/g, "").toLowerCase();

export class OrgChartControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    private root!: Root;
    private context!: ComponentFramework.Context<IInputs>;
    // teamId -> array of employee names
    private membersByTeam: Record<string, string[]> = {};
    private membersLoaded = false;

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

    private async loadMembers(): Promise<void> {
        const query =
            "?$select=pam_name" +
            "&$expand=pam_position($select=pam_positiontitle;$expand=pam_Team($select=pam_teamsid))" +
            "&$filter=pam_position/pam_team ne null";

        try {
            const result = await this.context.webAPI.retrieveMultipleRecords(
                "pam_employee",
                query
            );

            const map: Record<string, string[]> = {};
            for (const emp of result.entities) {
                const name = emp.pam_name as string;
                const pos = emp.pam_position;
                const teamId = pos && pos.pam_team ? pos.pam_team.pam_teamsid : null;
                if (!name || !teamId) continue;
                const key = norm(teamId as string);
                (map[key] = map[key] || []).push(name);
            }
            this.membersByTeam = map;
            console.log("Members by team:", map);
        } catch (e) {
            console.error("Failed to load members:", e);
            this.membersByTeam = {};
        }

        this.membersLoaded = true;
        // re-render now that we have member data
        this.render();
    }

    public updateView(
        context: ComponentFramework.Context<IInputs>
    ): void {
        this.context = context;

        // Kick off the employee fetch once
        if (!this.membersLoaded) {
            this.loadMembers();
        }

        this.render();
    }

    private render(): void {
        const dataset = this.context.parameters.sampleDataSet;

        const nodes = dataset.sortedRecordIds.map((id: string, index: number) => {
            const record = dataset.records[id];
            const teamKey = norm(id);
            return {
                id: teamKey,
                type: "teamNode",
                position: { x: index * 300, y: 100 },
                data: {
                    teamName: record.getFormattedValue("pam_team"),
                    members: this.membersByTeam[teamKey] || []
                }
            };
        });

        const edges = dataset.sortedRecordIds
            .map((id: string) => {
                const record = dataset.records[id];
                const parent = record.getValue("pam_parentteam");
                if (!parent) return null;
                const ref = parent as ComponentFramework.EntityReference;
                if (!ref.id) return null;
                return {
                    id: `e-${norm(id)}`,
                    source: norm(ref.id.guid),
                    target: norm(id)
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