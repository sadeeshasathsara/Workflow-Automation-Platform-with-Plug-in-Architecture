import React, { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
    ReactFlowProvider,
    addEdge,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    Connection,
    Edge,
    Node,
    OnConnect,
} from 'react-flow-renderer'
import axios from 'axios'

const initialNodes: Node[] = [
    {
        id: '1',
        type: 'input',
        data: { label: 'Trigger' },
        position: { x: 250, y: 5 },
    },
    {
        id: '2',
        data: { label: 'Plugin: logger' },
        position: { x: 100, y: 100 },
    },
    {
        id: '3',
        data: { label: 'Action: notify' },
        position: { x: 400, y: 100 },
    },
]

const initialEdges: Edge[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true },
    { id: 'e1-3', source: '1', target: '3' },
]

export default function FlowEditor() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [plugins, setPlugins] = useState<string[]>([])

    useEffect(() => {
        // fetch plugins list from API if available
        axios
            .get('/plugins')
            .then((res) => {
                if (res.data && res.data.plugins) {
                    setPlugins(res.data.plugins.map((p: any) => p.name))
                }
            })
            .catch(() => {
                // ignore if API not available in dev
            })
    }, [])

    const onConnect: OnConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params as any, eds)), [setEdges])

    const saveFlow = useCallback(() => {
        const payload = { nodes, edges }
        localStorage.setItem('savedFlow', JSON.stringify(payload))
        // stub: optionally post to server
        axios.post('/flows/save', payload).catch(() => { })
        alert('Flow saved to localStorage')
    }, [nodes, edges])

    const loadFlow = useCallback(() => {
        const raw = localStorage.getItem('savedFlow')
        if (!raw) return alert('No saved flow in localStorage')
        try {
            const parsed = JSON.parse(raw)
            setNodes(parsed.nodes || [])
            setEdges(parsed.edges || [])
        } catch (err) {
            console.error(err)
            alert('Failed to load saved flow')
        }
    }, [setNodes, setEdges])

    return (
        <div className="flex h-full">
            <div className="w-3/4 h-full border-r">
                <ReactFlowProvider>
                    <div style={{ width: '100%', height: '80vh' }}>
                        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
                            <MiniMap />
                            <Controls />
                            <Background gap={12} />
                        </ReactFlow>
                    </div>
                    <div className="p-2">
                        <button onClick={saveFlow} className="mr-2 px-3 py-1 bg-green-600 text-white rounded">Save</button>
                        <button onClick={loadFlow} className="px-3 py-1 bg-yellow-500 text-white rounded">Load</button>
                    </div>
                </ReactFlowProvider>
            </div>

            <aside className="w-1/4 p-4">
                <h3 className="font-semibold">Available Plugins</h3>
                <ul className="mt-2 space-y-2">
                    {plugins.length === 0 && <li className="text-sm text-slate-500">No plugins found (server may be offline)</li>}
                    {plugins.map((p) => (
                        <li key={p} className="px-2 py-1 border rounded">{p}</li>
                    ))}
                </ul>
                <div className="mt-4">
                    <h4 className="font-medium">Node Types</h4>
                    <ul className="text-sm mt-2">
                        <li>Trigger</li>
                        <li>Plugin</li>
                        <li>Action</li>
                    </ul>
                </div>
            </aside>
        </div>
    )
}
