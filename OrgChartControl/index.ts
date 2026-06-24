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

export class OrgChartControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {

    private container!: HTMLDivElement;
    private root!: Root;

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

    public updateView(
        context: ComponentFramework.Context<IInputs>
    ): void {

        const dataset = context.parameters.sampleDataSet;

        console.log("Columns:", dataset.columns);
        console.log("Record IDs:", dataset.sortedRecordIds);

        // DEBUG: inspect real Dataverse values
        dataset.sortedRecordIds.forEach((id: string) => {

            const record = dataset.records[id];

            console.log(
                "Team:",
                record.getFormattedValue("pam_team")
            );

            console.log(
                "ParentTeam:",
                record.getValue("pam_parentteam")
            );
        });

        const nodes = dataset.sortedRecordIds.map(
            (id: string, index: number) => {

                const record = dataset.records[id];

                return {
                    id,
                    type: "teamNode",
                    position: {
                        x: index * 300,
                        y: 100
                    },
                    data: {
                        teamName: record.getFormattedValue("pam_team"),
                        members: []
                    }
                };
            }
        );

            const edges = dataset.sortedRecordIds
                .map((id: string) => {

                    const record = dataset.records[id];

                    const parent =
                        record.getValue("pam_parentteam");

                    console.log(
                        "Edge Debug:",
                        record.getFormattedValue("pam_team"),
                        parent
                    );
                    if (!parent) {
                        return null;
                    }
                    const ref = parent as ComponentFramework.EntityReference;
                    if (!ref.id) {
                        return null;
                    }
                    const src = ref.id.guid;
                    console.log(
                        "Node Exists?",
                        nodes.some(n => n.id === src)
                    );
                    console.log("Creating Edge:", src, "->", id);
                    return {
                        id: `e-${id}`,
                        source: src,
                        target: id
                    };
                })
                .filter(
                    (edge): edge is NonNullable<typeof edge> =>
                        edge !== null
                );

        
        console.log("Nodes:", nodes);
        console.log("Edges:", edges);

        const positioned = layoutNodes(nodes, edges);

        console.log("Nodes:", positioned);
        console.log("Edges:", edges);
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