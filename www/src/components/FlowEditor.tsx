import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
    ReactFlowProvider,
    addEdge,
    Background,
    Controls,
    Edge,
    MiniMap,
    Node,
    Connection,
    useEdgesState,
    useNodesState,
} from 'react-flow-renderer'
import {
    FlowPayload,
    getEmailLogs,
    getPlugins,
    getStatus,
    installPluginFromPath,
    installPluginZip,
    loadFlow,
    saveFlow,
    sendEmail,
    StatusResponse,
    PluginItem,
} from '../lib/api'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import RightPanel from './RightPanel'

type PanelId = 'overview' | 'plugins' | 'email' | 'flows' | 'logs'

const initialNodes: Node[] = [
    {
        id: 'trigger',
        type: 'input',
        data: { label: '⚡ Email Trigger' },
        position: { x: 80, y: 180 },
    },
    {
        id: 'logger',
        data: { label: '📝 Logger Plugin' },
        position: { x: 340, y: 100 },
    },
    {
        id: 'notify',
        data: { label: '🔔 Notify Action' },
        position: { x: 340, y: 260 },
    },
]

const initialEdges: Edge[] = [
    { id: 'e-trigger-logger', source: 'trigger', target: 'logger', animated: true },
    { id: 'e-trigger-notify', source: 'trigger', target: 'notify' },
]

export default function FlowEditor() {
    const [activePanel, setActivePanel] = useState<PanelId>('overview')
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [status, setStatus] = useState<StatusResponse | null>(null)
    const [plugins, setPlugins] = useState<PluginItem[]>([])
    const [emailLogs, setEmailLogs] = useState<any[]>([])
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [installSourcePath, setInstallSourcePath] = useState('external_plugins/sample_external_plugin')
    const [forceInstall, setForceInstall] = useState(true)
    const [emailFrom, setEmailFrom] = useState('alice@example.com')
    const [emailSubject, setEmailSubject] = useState('Hello from the workflow UI')
    const [flowName, setFlowName] = useState('My Automation Flow')
    const [selectedPlugin, setSelectedPlugin] = useState('logger')

    const refreshAll = useCallback(async () => {
        setBusy(true)
        setMessage('Refreshing…')
        try {
            const [s, p, l, f] = await Promise.allSettled([getStatus(), getPlugins(), getEmailLogs(), loadFlow()])
            if (s.status === 'fulfilled') setStatus(s.value)
            if (p.status === 'fulfilled') {
                setPlugins(p.value.plugins || [])
                if (!selectedPlugin && p.value.plugins?.length) setSelectedPlugin(p.value.plugins[0].name)
            }
            if (l.status === 'fulfilled') setEmailLogs(l.value.logs || [])
            if (f.status === 'fulfilled' && f.value.flow) {
                const saved = f.value.flow as FlowPayload
                if (Array.isArray(saved.nodes)) setNodes(saved.nodes as Node[])
                if (Array.isArray(saved.edges)) setEdges(saved.edges as Edge[])
            }
            setMessage('Data refreshed')
        } catch {
            setMessage('Refresh failed')
        } finally {
            setBusy(false)
        }
    }, [selectedPlugin, setEdges, setNodes])

    useEffect(() => { refreshAll() }, [refreshAll])

    const onConnect = useCallback(
        (c: Connection) => { setEdges((e) => addEdge(c, e)); setMessage('Connection added') },
        [setEdges]
    )

    const handleSaveFlow = useCallback(async () => {
        setBusy(true)
        try {
            const payload: FlowPayload = { nodes, edges }
            await saveFlow(payload)
            localStorage.setItem('savedFlow', JSON.stringify(payload))
            setMessage(`"${flowName}" saved`)
        } catch { setMessage('Save failed') }
        finally { setBusy(false) }
    }, [edges, flowName, nodes])

    const handleLoadFlow = useCallback(async () => {
        setBusy(true)
        try {
            const res = await loadFlow()
            const flow = res.flow || JSON.parse(localStorage.getItem('savedFlow') || 'null')
            if (flow?.nodes) setNodes(flow.nodes)
            if (flow?.edges) setEdges(flow.edges)
            setMessage('Flow loaded')
        } catch { setMessage('Load failed') }
        finally { setBusy(false) }
    }, [setEdges, setNodes])

    const handleInstallPath = useCallback(async () => {
        setBusy(true)
        try {
            await installPluginFromPath(installSourcePath, forceInstall)
            await refreshAll()
            setMessage(`Installed: ${installSourcePath}`)
        } catch { setMessage('Install failed') }
        finally { setBusy(false) }
    }, [forceInstall, installSourcePath, refreshAll])

    const handleInstallZip = useCallback(async (file: File) => {
        setBusy(true)
        try {
            await installPluginZip(file, forceInstall)
            await refreshAll()
            setMessage(`Installed zip: ${file.name}`)
        } catch { setMessage('Zip install failed') }
        finally { setBusy(false) }
    }, [forceInstall, refreshAll])

    const handleSendEmail = useCallback(async () => {
        setBusy(true)
        try {
            await sendEmail({ from_addr: emailFrom, subject: emailSubject })
            const [s, l] = await Promise.all([getStatus(), getEmailLogs()])
            setStatus(s)
            setEmailLogs(l.logs || [])
            setMessage('Email event dispatched')
        } catch { setMessage('Email send failed') }
        finally { setBusy(false) }
    }, [emailFrom, emailSubject])

    // Stats strip
    const stats = [
        { label: 'Status',  value: status?.status ?? '—' },
        { label: 'Plugins', value: String(plugins.length) },
        { label: 'Nodes',   value: String(nodes.length)   },
        { label: 'Logs',    value: String(emailLogs.length) },
    ]

    return (
        <ReactFlowProvider>
            <div className="flex h-full w-full overflow-hidden">
                {/* ── Left sidebar ── */}
                <Sidebar active={activePanel} onSelect={(id) => setActivePanel(id as PanelId)} />

                {/* ── Main content ── */}
                <div className="flex flex-col flex-1 min-w-0 h-full">
                    {/* Top bar */}
                    <TopBar
                        busy={busy}
                        message={message}
                        flowName={flowName}
                        onFlowNameChange={setFlowName}
                        onSave={handleSaveFlow}
                        onLoad={handleLoadFlow}
                        onRefresh={refreshAll}
                        onRun={handleSendEmail}
                    />

                    {/* Stats strip */}
                    <div className="flex items-center gap-0 shrink-0 overflow-x-auto"
                        style={{ background: '#13131f', borderBottom: '1px solid #1e1e30' }}>
                        {stats.map((s, i) => (
                            <div key={s.label}
                                className="flex items-center gap-3 px-5 py-2.5 border-r"
                                style={{ borderColor: '#1e1e30' }}>
                                <span className="text-xs" style={{ color: '#5555aa' }}>{s.label}</span>
                                <span className="text-sm font-semibold" style={{ color: '#e0e0ff' }}>{s.value}</span>
                            </div>
                        ))}
                        <div className="flex-1" />
                        <div className="px-4 text-xs" style={{ color: '#3a3a5c' }}>
                            {nodes.length} nodes · {edges.length} edges
                        </div>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 relative min-h-0">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            fitView
                            style={{ background: '#0f0f1a' }}
                        >
                            <Background
                                variant={'dots' as any}
                                gap={24}
                                size={1}
                                color="#2d2d4a"
                            />
                            <Controls />
                            <MiniMap
                                nodeColor="#ff6d5a"
                                maskColor="rgba(15,15,26,0.8)"
                            />
                        </ReactFlow>

                        {/* Busy overlay */}
                        {busy && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                style={{ background: 'rgba(15,15,26,0.6)' }}>
                                <div className="flex items-center gap-3 px-5 py-3 rounded-xl"
                                    style={{ background: '#1e1e30', border: '1px solid #2d2d4a' }}>
                                    <svg className="animate-spin-slow w-5 h-5" style={{ color: '#ff6d5a' }}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round"
                                            d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
                                    </svg>
                                    <span className="text-sm font-medium" style={{ color: '#e0e0ff' }}>{message}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right panel ── */}
                <RightPanel
                    activePanel={activePanel}
                    status={status}
                    plugins={plugins}
                    emailLogs={emailLogs}
                    installSourcePath={installSourcePath}
                    setInstallSourcePath={setInstallSourcePath}
                    forceInstall={forceInstall}
                    setForceInstall={setForceInstall}
                    flowName={flowName}
                    setFlowName={setFlowName}
                    emailFrom={emailFrom}
                    setEmailFrom={setEmailFrom}
                    emailSubject={emailSubject}
                    setEmailSubject={setEmailSubject}
                    selectedPlugin={selectedPlugin}
                    onInstallPath={handleInstallPath}
                    onInstallZip={handleInstallZip}
                    onSendEmail={handleSendEmail}
                    onSaveFlow={handleSaveFlow}
                    onLoadFlow={handleLoadFlow}
                    busy={busy}
                />
            </div>
        </ReactFlowProvider>
    )
}
