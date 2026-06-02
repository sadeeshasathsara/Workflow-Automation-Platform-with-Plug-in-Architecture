import React, { useCallback, useEffect, useRef, useState } from 'react'
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
    ReactFlowInstance,
    getSmoothStepPath,
    getEdgeCenter,
    EdgeProps,
} from 'react-flow-renderer'

// Standard React Flow styles for correct SVG alignment, rendering, and interaction
import 'react-flow-renderer/dist/style.css'
import 'react-flow-renderer/dist/theme-default.css'
import {
    ExecutionResult,
    FlowPayload,
    executeFlow,
    executeFlowStream,
    getEmailLogs,
    getPlugins,
    getStatus,
    getSchedulerStatus,
    installPluginFromPath,
    installPluginZip,
    listExecutions,
    loadFlow,
    saveFlow,
    sendEmail,
    StatusResponse,
    PluginItem,
    getFlows,
    deleteFlow,
    getPluginSchema,
    testPluginConnection,
    getPluginCredentials,
    savePluginCredentials,
    deletePluginCredentials,
    PluginSchema,
    getPendingNotifications,
    BrowserNotificationEvent,
    BulkPluginSchemas,
    getAllPluginSchemas,
} from '../lib/api'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import RightPanel from './RightPanel'

type PanelId = 'overview' | 'plugins' | 'email' | 'flows' | 'executions' | 'logs'

const initialNodes: Node[] = [
    {
        id: 'trigger',
        type: 'input',
        data: { label: '📧 Gmail Trigger', plugin: 'gmail' },
        position: { x: 80, y: 180 },
    },
    {
        id: 'logger',
        data: { label: '📝 Logger Plugin', plugin: 'logger' },
        position: { x: 340, y: 100 },
    },
    {
        id: 'notify',
        data: { label: '🔔 System Notifier', plugin: 'notification' },
        position: { x: 340, y: 260 },
    },
]

const initialEdges: Edge[] = [
    { id: 'e-trigger-logger', source: 'trigger', target: 'logger', type: 'smoothstep' },
    { id: 'e-trigger-notify', source: 'trigger', target: 'notify', type: 'smoothstep' },
]

// ── Moving-packet custom edge ───────────────────────────────────────────────
// react-flow-renderer v10: getSmoothStepPath returns a plain SVG path string.
// We pass it directly to <path d={...}> and to <animateMotion path={...}>
// so the packet physically travels along the exact curved wire.
function CustomSmoothStepEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    label,
    animated,
}: EdgeProps) {
    const edgePath: string = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8,
    }) as unknown as string          // v10 returns string; cast past old typings

    // getEdgeCenter returns [cx, cy, offsetX, offsetY]
    const [cx, cy] = getEdgeCenter({ sourceX, sourceY, targetX, targetY })

    const dx = targetX - sourceX
    const dy = targetY - sourceY

    // Calculate rotation angle based on flow direction
    let angle = 0
    if (Math.abs(dx) >= Math.abs(dy)) {
        angle = dx >= 0 ? 0 : 180
    } else {
        angle = dy >= 0 ? 90 : 270
    }

    const packetLabel = typeof label === 'string' && label ? label : '📦'
    const speed       = '1.0s'

    return (
        <>
            {/* The wire line itself */}
            <path
                id={id}
                style={style}
                fill="none"
                className={`react-flow__edge-path${animated ? ' animated' : ''}`}
                d={edgePath}
            />

            {/* Midpoint Arrowhead */}
            <g transform={`translate(${cx}, ${cy}) rotate(${angle})`} style={{ pointerEvents: 'none' }}>
                <path
                    d="M -6,-5 L 6,0 L -6,5 Z"
                    fill="#ff6d5a"
                    style={{
                        filter: animated ? 'drop-shadow(0 0 4px #ff6d5a)' : 'none',
                        transition: 'fill 0.2s ease'
                    }}
                />
            </g>

            {/* Invisible thick path for easy interaction & clicking (especially on touch screens) */}
            <path
                className="react-flow__edge-interaction"
                d={edgePath}
                style={{ fill: 'none', stroke: 'transparent', strokeWidth: 32, cursor: 'pointer' }}
            />

            {/* Glowing packet that rides along the wire when active */}
            {animated && (
                <g style={{ pointerEvents: 'none' }}>
                    <circle r="12" fill="#13131f" stroke="#ffb832" strokeWidth="2.5"
                        style={{ filter: 'drop-shadow(0 0 6px #ffb832)' }}>
                        <animateMotion dur={speed} repeatCount="indefinite" path={edgePath} calcMode="linear" />
                    </circle>
                    <text x="0" y="0" fontSize="14" textAnchor="middle" dominantBaseline="central" fill="#ffffff"
                        style={{ userSelect: 'none' }}>
                        <animateMotion dur={speed} repeatCount="indefinite" path={edgePath} calcMode="linear" />
                        {packetLabel}
                    </text>
                </g>
            )}
        </>
    )
}

const edgeTypes = { smoothstep: CustomSmoothStepEdge }

export default function FlowEditor() {
    const [activePanel, setActivePanel] = useState<PanelId>('overview')
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [status, setStatus] = useState<StatusResponse | null>(null)
    const [plugins, setPlugins] = useState<PluginItem[]>([])
    const [emailLogs, setEmailLogs] = useState<any[]>([])
    const [executions, setExecutions] = useState<ExecutionResult[]>([])
    const [lastExecution, setLastExecution] = useState<ExecutionResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [installSourcePath, setInstallSourcePath] = useState('external_plugins/sample_external_plugin')
    const [forceInstall, setForceInstall] = useState(true)
    const [emailFrom, setEmailFrom] = useState('alice@example.com')
    const [emailSubject, setEmailSubject] = useState('Hello from the workflow UI')
    const [flowName, setFlowName] = useState('My Automation Flow')
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
    const rfInstanceRef = useRef<ReactFlowInstance | null>(null)   // stable ref so callbacks don't need it as dep
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const nodeIdCounter = useRef(10)
    const [showFloatingAddMenu, setShowFloatingAddMenu] = useState(false)
    const [flowsList, setFlowsList] = useState<any[]>([])
    const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
    const [selectedPlugin, setSelectedPlugin] = useState<PluginItem | null>(null)
    const [pluginSchema, setPluginSchema] = useState<PluginSchema | null>(null)
    const [pluginCredentials, setPluginCredentials] = useState<Record<string, string>>({})
    const [testConnectionResult, setTestConnectionResult] = useState<any>(null)
    const [schedulerRunning, setSchedulerRunning] = useState<boolean>(false)
    const [flowActive, setFlowActive] = useState<boolean>(false)
    const [isExecuting, setIsExecuting] = useState<boolean>(false)
    const abortCtrlRef = useRef<AbortController | null>(null)
    const lastTriggerSigRef = useRef<Record<string, string>>({})
    const [backendExecuting, setBackendExecuting] = useState<boolean>(false)
    const lastSyncExecIdRef = useRef<string | null>(null)
    const [toasts, setToasts] = useState<Array<{ id: string; title: string; message: string; icon: string; level: 'info' | 'success' | 'warning' | 'error' }>>([])

    const showToast = useCallback((title: string, message: string, icon = '🔔', level: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        const id = Math.random().toString(36).substring(2, 9)
        setToasts(prev => [...prev, { id, title, message, icon, level }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 6000)
    }, [])

    const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null)
    const [selectedNode, setSelectedNode] = useState<Node | null>(null)
    const [pluginSchemasCache, setPluginSchemasCache] = useState<BulkPluginSchemas | null>(null)

    useEffect(() => {
        const fetchSchemas = async () => {
            try {
                const s = await getAllPluginSchemas()
                setPluginSchemasCache(s)
            } catch (err) {
                console.error("Failed to fetch bulk plugin schemas:", err)
            }
        }
        fetchSchemas()
    }, [])



    // ── Canvas History System (Undo / Redo) ───────────────────────────────
    const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([])
    const historyIndexRef = useRef<number>(-1)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)
    const skipHistoryRef = useRef(false)
    const debounceTimeoutRef = useRef<any>(null)

    // Helper to update button state visuals
    const updateHistoryButtons = useCallback(() => {
        setCanUndo(historyIndexRef.current > 0)
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
    }, [])

    // Take snapshot and push to stack
    const pushHistory = useCallback((nds: Node[], eds: Edge[]) => {
        const snapshot = JSON.parse(JSON.stringify({ nodes: nds, edges: eds }))
        
        // Sanitize snapshot: remove temporary execution highlights so they are not captured in history
        snapshot.nodes = snapshot.nodes.map((n: any) => ({
            ...n,
            className: undefined
        }))
        snapshot.edges = snapshot.edges.map((e: any) => ({
            ...e,
            animated: false,
            label: undefined
        }))

        const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
        
        // Avoid pushing identical consecutive snapshots
        if (nextHistory.length > 0) {
            const last = nextHistory[nextHistory.length - 1]
            if (JSON.stringify(last.nodes) === JSON.stringify(snapshot.nodes) && 
                JSON.stringify(last.edges) === JSON.stringify(snapshot.edges)) {
                return
            }
        }

        nextHistory.push(snapshot)
        historyRef.current = nextHistory
        historyIndexRef.current = nextHistory.length - 1
        updateHistoryButtons()
    }, [updateHistoryButtons])

    // Reset history stack (e.g. when loading a new flow)
    const initHistory = useCallback((nds: Node[], eds: Edge[]) => {
        const snapshot = JSON.parse(JSON.stringify({ nodes: nds, edges: eds }))
        
        // Sanitize snapshot
        snapshot.nodes = snapshot.nodes.map((n: any) => ({ ...n, className: undefined }))
        snapshot.edges = snapshot.edges.map((e: any) => ({ ...e, animated: false, label: undefined }))

        historyRef.current = [snapshot]
        historyIndexRef.current = 0
        updateHistoryButtons()
    }, [updateHistoryButtons])

    // Debounced automatic change listener to capture user modifications (dragging, adding, deleting)
    useEffect(() => {
        if (skipHistoryRef.current) {
            skipHistoryRef.current = false
            return
        }

        // Keep history pristine: do not snapshot while backend/frontend execution is running
        if (isExecuting || backendExecuting) return

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current)
        }

        debounceTimeoutRef.current = setTimeout(() => {
            pushHistory(nodes, edges)
        }, 400)

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current)
            }
        }
    }, [nodes, edges, isExecuting, backendExecuting, pushHistory])

    // Revert to previous state
    const handleUndo = useCallback(() => {
        if (historyIndexRef.current > 0) {
            const nextIndex = historyIndexRef.current - 1
            historyIndexRef.current = nextIndex
            const prev = historyRef.current[nextIndex]
            
            skipHistoryRef.current = true
            setNodes(JSON.parse(JSON.stringify(prev.nodes)))
            skipHistoryRef.current = true
            setEdges(JSON.parse(JSON.stringify(prev.edges)))
            
            updateHistoryButtons()
            showToast('Undo', 'Reverted last change', '↩️', 'info')
        }
    }, [setNodes, setEdges, showToast, updateHistoryButtons])

    // Apply next state
    const handleRedo = useCallback(() => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            const nextIndex = historyIndexRef.current + 1
            historyIndexRef.current = nextIndex
            const nextState = historyRef.current[nextIndex]
            
            skipHistoryRef.current = true
            setNodes(JSON.parse(JSON.stringify(nextState.nodes)))
            skipHistoryRef.current = true
            setEdges(JSON.parse(JSON.stringify(nextState.edges)))
            
            updateHistoryButtons()
            showToast('Redo', 'Reapplied change', '↪️', 'info')
        }
    }, [setNodes, setEdges, showToast, updateHistoryButtons])


    const handleSelectConfigurePlugin = useCallback(async (plugin: PluginItem) => {
        setBusy(true)
        setMessage(`Loading ${plugin.display_name || plugin.name} settings…`)
        setTestConnectionResult(null)
        try {
            const [schema, creds] = await Promise.all([
                getPluginSchema(plugin.name),
                getPluginCredentials(plugin.name)
            ])
            setSelectedPlugin(plugin)
            setPluginSchema(schema)

            // Seed defaults from XML config_elements for any field that has no stored cred
            const stored: Record<string, string> = creds.credentials || {}
            const withDefaults: Record<string, string> = { ...stored }
            if (schema.config_elements) {
                for (const elem of schema.config_elements) {
                    if (elem.element_type === 'field' && !(elem.name in withDefaults)) {
                        const def = (elem as any).default
                        if (def !== undefined && def !== null) {
                            withDefaults[elem.name] = String(def)
                        }
                    }
                }
            }
            setPluginCredentials(withDefaults)
        } catch {
            setMessage('Failed to load plugin details')
        } finally {
            setBusy(false)
        }
    }, [])

    const handleUpdateCredentialField = useCallback((field: string, value: string) => {
        setPluginCredentials(prev => ({ ...prev, [field]: value }))
    }, [])

    const handleSavePluginCredentials = useCallback(async () => {
        if (!selectedPlugin) return
        setBusy(true)
        setMessage('Saving configuration…')
        try {
            await savePluginCredentials(selectedPlugin.name, pluginCredentials)
            setMessage('Configuration saved')

            // Refresh loaded state
            const [s, p] = await Promise.all([
                getStatus(),
                getPlugins()
            ])
            setStatus(s)
            setPlugins(p.plugins || [])
        } catch {
            setMessage('Failed to save config')
        } finally {
            setBusy(false)
        }
    }, [selectedPlugin, pluginCredentials])

    const handleDeletePluginCredentials = useCallback(async () => {
        if (!selectedPlugin) return
        if (!confirm('Are you sure you want to clear this plugin configuration?')) return
        setBusy(true)
        setMessage('Clearing configuration…')
        try {
            await deletePluginCredentials(selectedPlugin.name)
            setPluginCredentials({})
            setTestConnectionResult(null)
            setMessage('Configuration cleared')

            // Refresh loaded state
            const [s, p] = await Promise.all([
                getStatus(),
                getPlugins()
            ])
            setStatus(s)
            setPlugins(p.plugins || [])
        } catch {
            setMessage('Failed to clear config')
        } finally {
            setBusy(false)
        }
    }, [selectedPlugin])

    const handleTestPluginConnection = useCallback(async () => {
        if (!selectedPlugin) return
        setBusy(true)
        setMessage('Testing connection…')
        setTestConnectionResult(null)
        try {
            const res = await testPluginConnection(selectedPlugin.name, pluginCredentials)
            setTestConnectionResult(res)
            if (res.ok) {
                setMessage('Connection test passed')
            } else {
                setMessage('Connection test failed')
            }
        } catch (e: any) {
            setTestConnectionResult({ ok: false, error: e.message || 'Request failed' })
            setMessage('Connection test failed')
        } finally {
            setBusy(false)
        }
    }, [selectedPlugin, pluginCredentials])

    const handleBackToPlugins = useCallback(() => {
        setSelectedPlugin(null)
        setPluginSchema(null)
        setPluginCredentials({})
        setTestConnectionResult(null)
    }, [])

    const refreshAll = useCallback(async () => {
        setBusy(true)
        setMessage('Refreshing…')
        try {
            const [s, p, l, f, e, w] = await Promise.allSettled([
                getStatus(),
                getPlugins(),
                getEmailLogs(),
                loadFlow(),
                listExecutions(10),
                getFlows(),
            ])
            if (s.status === 'fulfilled') setStatus(s.value)
            if (p.status === 'fulfilled') {
                setPlugins(p.value.plugins || [])
            }
            if (l.status === 'fulfilled') setEmailLogs(l.value.logs || [])
            if (w.status === 'fulfilled') setFlowsList(w.value.flows || [])
            if (f.status === 'fulfilled' && f.value.flow) {
                const saved = f.value.flow as any
                setActiveFlowId(saved.id || null)
                setFlowActive(saved.active || false)
                if (saved.name) setFlowName(saved.name)
                let finalNodes: Node[] = []
                let finalEdges: Edge[] = []
                if (Array.isArray(saved.nodes) && saved.nodes.length > 0) {
                    finalNodes = (saved.nodes as Node[]).map((n, idx) => ({
                        ...n,
                        position: n.position || { x: 80 + idx * 260, y: 180 }
                    }))
                    setNodes(finalNodes)
                    // Update nodeIdCounter to match max ID
                    const ids = finalNodes.map((n: Node) => parseInt(n.id.replace('node-', ''), 10)).filter((id: number) => !isNaN(id))
                    if (ids.length > 0) {
                        nodeIdCounter.current = Math.max(...ids)
                    }
                    // Fit canvas to loaded nodes after React has committed
                    setTimeout(() => {
                        if (rfInstanceRef.current) rfInstanceRef.current.fitView({ duration: 350, padding: 0.15 })
                    }, 120)
                }
                if (Array.isArray(saved.edges) && saved.edges.length > 0) {
                    finalEdges = (saved.edges as Edge[]).map(e => ({ ...e, type: 'smoothstep' }))
                    // Ensure all saved edges use the custom renderer
                    setEdges(finalEdges)
                }
                initHistory(finalNodes, finalEdges)
            }
            if (e.status === 'fulfilled') setExecutions(e.value || [])
            setMessage('Data refreshed')
        } catch {
            setMessage('Refresh failed')
        } finally {
            setBusy(false)
        }
    }, [setEdges, setNodes])

    useEffect(() => { refreshAll() }, [refreshAll])

    // ── Dual-binding HTML5 Path Router (Syncs URL Pathname with activePanel state) ──
    useEffect(() => {
        const handlePathChange = () => {
            const path = window.location.pathname.replace(/^\//, '') as PanelId
            const validPanels: PanelId[] = ['overview', 'plugins', 'email', 'flows', 'executions', 'logs']
            if (validPanels.includes(path)) {
                setActivePanel(path)
            }
        }

        // Initialize state from path on mount (default to 'overview' if empty/invalid)
        const initialPath = window.location.pathname.replace(/^\//, '')
        const validPanels: PanelId[] = ['overview', 'plugins', 'email', 'flows', 'executions', 'logs']
        if (validPanels.includes(initialPath as PanelId)) {
            setActivePanel(initialPath as PanelId)
        } else if (initialPath === '' || initialPath === 'index.html') {
            setActivePanel('overview')
            window.history.replaceState(null, '', '/overview')
        }

        window.addEventListener('popstate', handlePathChange)
        return () => window.removeEventListener('popstate', handlePathChange)
    }, [])

    useEffect(() => {
        const path = window.location.pathname.replace(/^\//, '')
        if (path !== activePanel) {
            window.history.pushState(null, '', `/${activePanel}`)
        }
    }, [activePanel])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const gmailAuth = params.get('gmail_auth')
        if (gmailAuth) {
            if (gmailAuth === 'success') {
                setMessage('Google Account linked successfully')
                setActivePanel('plugins')
                getPlugins().then(p => {
                    const gmail = (p.plugins || []).find((x: any) => x.name === 'gmail')
                    if (gmail) {
                        handleSelectConfigurePlugin(gmail)
                    }
                })
            } else if (gmailAuth === 'error') {
                const errorMsg = params.get('message') || 'Unknown error occurred during authorization.'
                setMessage(`Google Link Error: ${errorMsg}`)
            }
            // Clean up address bar query parameters
            const cleanUrl = window.location.origin + window.location.pathname
            window.history.replaceState({}, document.title, cleanUrl)
        }
    }, [handleSelectConfigurePlugin])

    // ── Browser Notification Poller ────────────────────────────────────────
    useEffect(() => {
        // Level → prefix emoji for in-app message bar feedback
        const levelPrefix: Record<string, string> = {
            info:    '🔔',
            success: '✅',
            warning: '⚠️',
            error:   '❌',
        }

        const fireNotification = (ev: BrowserNotificationEvent) => {
            const prefix = levelPrefix[ev.level] || '🔔'

            // Native browser notification - alert the user specifically when they are NOT looking at the active tab
            if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
                try {
                    const n = new Notification(`${prefix} ${ev.title}`, {
                        body:    ev.message,
                        icon:    '/favicon.ico',
                        tag:     ev.id,          // dedup: same tag replaces previous
                        silent:  false,
                    })
                    // Auto-close after 8 seconds
                    setTimeout(() => n.close(), 8000)
                } catch { /* some browsers restrict new Notification outside user gesture */ }
            }
        }

        // Request permission once (non-blocking)
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {})
        }

        // Poll every 3 seconds for queued notification events
        const intervalId = setInterval(async () => {
            // Do NOT exit early when hidden. We need to poll the backend specifically
            // while the tab is backgrounded so we can fire native OS notifications.
            const events = await getPendingNotifications()
            events.forEach(ev => {
                showToast(ev.title, ev.message, ev.icon || '🔔', ev.level)
                fireNotification(ev)
            })
        }, 3000)

        return () => clearInterval(intervalId)
    }, []) // run once on mount

    useEffect(() => {
        // Poll immediately on mount, then every 10 seconds
        const poll = async () => {
            try {
                const s = await getSchedulerStatus()
                setSchedulerRunning(s.scheduler_running)
            } catch {
                setSchedulerRunning(false)
            }
        }
        poll()
        const id = setInterval(poll, 10_000)
        return () => clearInterval(id)
    }, [])

    // ── Background Execution Poller (Syncs backend executions to frontend visuals) ──
    useEffect(() => {
        let isMounted = true
        let clearHighlightsTimeout: any = null

        const pollExecutions = async () => {
            if (!isMounted) return
            // Skip syncing if manual execution is active in the frontend
            if (isExecuting) return

            try {
                const execs = await listExecutions(5)
                if (!isMounted) return

                const activeExec = execs.find(e => e.status === 'running')

                if (activeExec) {
                    setBackendExecuting(true)
                    lastSyncExecIdRef.current = activeExec.execution_id

                    // Sync nodes classes
                    setNodes((nds) => {
                        return nds.map((n) => {
                            const nr = activeExec.node_results.find(r => r.node_id === n.id)
                            if (nr) {
                                const cls =
                                    nr.status === 'running' ? 'exec-running' :
                                    nr.status === 'success' ? 'exec-success' :
                                    nr.status === 'error' ? 'exec-error' :
                                    'exec-pending'
                                return { ...n, className: cls }
                            }
                            return { ...n, className: 'exec-pending' }
                        })
                    })

                    // Sync edges animations:
                    // A packet moves FROM source TO target, so animate the edge
                    // when the SOURCE node is actively running or just succeeded.
                    setEdges((eds) => {
                        return eds.map((edge) => {
                            const newEdge = { ...edge, type: 'smoothstep' }
                            const sourceNr = activeExec.node_results.find(r => r.node_id === edge.source)

                            if (sourceNr) {
                                // Packet travels while source is running or just delivered output
                                newEdge.animated = (
                                    sourceNr.status === 'running' ||
                                    sourceNr.status === 'success'
                                )
                                if (sourceNr.status === 'success' && sourceNr.output) {
                                    newEdge.label = sourceNr.plugin_name === 'gmail' ? '✉️' : '📦'
                                }
                            } else {
                                newEdge.animated = false
                            }
                            return newEdge
                        })
                    })

                    if (clearHighlightsTimeout) {
                        clearTimeout(clearHighlightsTimeout)
                        clearHighlightsTimeout = null
                    }
                } else {
                    if (backendExecuting) {
                        setBackendExecuting(false)
                        
                        const latest = execs[0]
                        if (latest && latest.execution_id === lastSyncExecIdRef.current) {
                            setNodes((nds) => {
                                return nds.map((n) => {
                                    const nr = latest.node_results.find(r => r.node_id === n.id)
                                    if (nr) {
                                        const cls = nr.status === 'success' ? 'exec-success' : nr.status === 'error' ? 'exec-error' : undefined
                                        return { ...n, className: cls }
                                    }
                                    return { ...n, className: undefined }
                                })
                            })
                            setEdges((eds) => eds.map(e => ({ ...e, animated: false })))

                            clearHighlightsTimeout = setTimeout(() => {
                                setNodes((nds) => nds.map(n => ({ ...n, className: undefined })))
                                setEdges((eds) => eds.map(e => ({ ...e, label: undefined })))
                            }, 4000)
                        } else {
                            setNodes((nds) => nds.map(n => ({ ...n, className: undefined })))
                            setEdges((eds) => eds.map(e => ({ ...e, animated: false, label: undefined })))
                        }

                        // Refresh executions list
                        setExecutions(execs)
                        if (execs[0]) setLastExecution(execs[0])
                    }
                }
            } catch (err) {
                // Fail silently
            }
        }

        // Run immediately, then poll every 3 seconds
        pollExecutions()
        const intervalId = setInterval(pollExecutions, 3000)

        return () => {
            isMounted = false
            clearInterval(intervalId)
            if (clearHighlightsTimeout) clearTimeout(clearHighlightsTimeout)
        }
    }, [isExecuting, backendExecuting, setNodes, setEdges, setExecutions, setLastExecution])

    const onConnect = useCallback(
        (c: Connection) => {
            setEdges((e) => addEdge({ ...c, type: 'smoothstep' }, e))
            setMessage('Connection added')
        },
        [setEdges]
    )

    const onEdgeClick = useCallback(
        (_event: React.MouseEvent, edge: Edge) => {
            setSelectedEdge(edge)
            setSelectedNode(null)
            setMessage(`Selected connection: ${edge.source} → ${edge.target}`)
        },
        []
    )

    // ── Click node to open its settings ─────────────────────────────────────
    const onNodeClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            setSelectedNode(node)
            setSelectedEdge(null)
            setMessage(`Selected node: ${node.data?.label || node.id}`)
        },
        []
    )


    // ── Drag-and-drop from plugin panel onto canvas ────────────────────────
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault()
            if (!rfInstance || !reactFlowWrapper.current) return

            const pluginName = event.dataTransfer.getData('application/workflow-plugin-name')
            const pluginLabel = event.dataTransfer.getData('application/workflow-plugin-label')
            const pluginIcon = event.dataTransfer.getData('application/workflow-plugin-icon')
            if (!pluginName) return

            const bounds = reactFlowWrapper.current.getBoundingClientRect()
            const position = rfInstance.project({
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
            })

            // Determine if trigger or action
            const foundPlugin = plugins.find(p => p.name === pluginName)
            const nodeType = foundPlugin?.type === 'trigger' ? 'input' : 'default'

            nodeIdCounter.current += 1
            const newNode: Node = {
                id: `node-${nodeIdCounter.current}`,
                type: nodeType,
                data: { label: `${pluginIcon} ${pluginLabel}`, plugin: pluginName },
                position,
            }
            setNodes((nds) => nds.concat(newNode))
            setMessage(`Added node: ${pluginLabel}`)
        },
        [rfInstance, setNodes, plugins]
    )

    // ── Flow actions ───────────────────────────────────────────────────────
    const handleSaveFlow = useCallback(async () => {
        setBusy(true)
        try {
            const payload = {
                id: activeFlowId || undefined,
                name: flowName,
                nodes,
                edges,
                active: flowActive
            }
            const res = await saveFlow(payload)
            if (res.id) {
                setActiveFlowId(res.id)
                const list = await getFlows()
                setFlowsList(list.flows || [])
            }
            localStorage.setItem('savedFlow', JSON.stringify(res.flow))
            setMessage(`"${flowName}" saved`)
        } catch { setMessage('Save failed') }
        finally { setBusy(false) }
    }, [edges, flowName, nodes, activeFlowId, flowActive])

    const handleToggleActive = useCallback(async (targetActive: boolean) => {
        // Request browser notification permission on user gesture (clicking switch)
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {})
        }

        setBusy(true)
        setMessage(targetActive ? '⏳ Starting background workflow…' : '⏳ Stopping background workflow…')
        try {
            const payload = {
                id: activeFlowId || undefined,
                name: flowName,
                nodes,
                edges,
                active: targetActive
            }
            const res = await saveFlow(payload)
            if (res.id) {
                setActiveFlowId(res.id)
                setFlowActive(targetActive)
                const list = await getFlows()
                setFlowsList(list.flows || [])
            }
            localStorage.setItem('savedFlow', JSON.stringify(res.flow))
            setMessage(targetActive ? '▶ Background trigger active' : '⏹ Background trigger stopped')
        } catch {
            setMessage(targetActive ? 'Start failed' : 'Stop failed')
        } finally {
            setBusy(false)
        }
    }, [edges, flowName, nodes, activeFlowId])

    const handleLoadFlow = useCallback(async (id?: string) => {
        setBusy(true)
        try {
            const res = await loadFlow(id)
            const flow = res.flow
            if (flow) {
                setActiveFlowId(flow.id || null)
                setFlowActive(flow.active || false)
                if (flow.name) setFlowName(flow.name)
                
                let finalNodes: Node[] = []
                let finalEdges: Edge[] = []
                
                if (Array.isArray(flow.nodes) && flow.nodes.length > 0) {
                    finalNodes = (flow.nodes as Node[]).map((n, idx) => ({
                        ...n,
                        position: n.position || { x: 80 + idx * 260, y: 180 }
                    }))
                    setNodes(finalNodes)
                    const ids = finalNodes.map((n: Node) => parseInt(n.id.replace('node-', ''), 10)).filter((id: number) => !isNaN(id))
                    if (ids.length > 0) {
                        nodeIdCounter.current = Math.max(...ids)
                    }
                    setTimeout(() => {
                        if (rfInstanceRef.current) rfInstanceRef.current.fitView({ duration: 350, padding: 0.15 })
                    }, 120)
                }
                if (Array.isArray(flow.edges) && flow.edges.length > 0) {
                    finalEdges = (flow.edges as Edge[]).map(e => ({ ...e, type: 'smoothstep' }))
                    setEdges(finalEdges)
                }
                initHistory(finalNodes, finalEdges)
                setMessage(`Loaded "${flow.name}"`)
            } else {
                setMessage('No flow found')
            }
        } catch { setMessage('Load failed') }
        finally { setBusy(false) }
    }, [setEdges, setNodes, initHistory])

    const handleNewFlow = useCallback(() => {
        setActiveFlowId(null)
        setFlowActive(false)
        setFlowName('Untitled Workflow')
        setNodes(initialNodes)
        setEdges(initialEdges)
        setMessage('Blank workflow created')
        initHistory(initialNodes, initialEdges)
    }, [setNodes, setEdges, initHistory])

    const handleDeleteFlow = useCallback(async (id: string) => {
        setBusy(true)
        try {
            await deleteFlow(id)
            const list = await getFlows()
            setFlowsList(list.flows || [])
            setMessage('Workflow deleted')
            if (activeFlowId === id) {
                handleNewFlow()
            }
        } catch { setMessage('Delete failed') }
        finally { setBusy(false) }
    }, [activeFlowId, handleNewFlow])

    const spawnNodeAtCenter = useCallback((plugin: PluginItem) => {
        if (!rfInstance || !reactFlowWrapper.current) return

        // Project the pixel center of the canvas wrapper into flow coordinates
        const bounds = reactFlowWrapper.current.getBoundingClientRect()
        const position = rfInstance.project({
            x: bounds.width / 2,
            y: bounds.height / 2,
        })

        nodeIdCounter.current += 1
        const newNode: Node = {
            id: `node-${nodeIdCounter.current}`,
            type: plugin.type === 'trigger' ? 'input' : 'default',
            data: { label: `${plugin.icon || '🧩'} ${plugin.display_name || plugin.name}`, plugin: plugin.name },
            position,
        }
        setNodes((nds) => nds.concat(newNode))
        setMessage(`Added: ${plugin.display_name || plugin.name}`)
        setShowFloatingAddMenu(false)
    }, [rfInstance, setNodes])

    // ── Execute the visual flow ────────────────────────────────────────────

    /** Map node_id → exec CSS class for live canvas highlighting */
    const applyNodeClass = useCallback(
        (nodeId: string, cls: string) => {
            setNodes((nds) =>
                nds.map((n) => n.id === nodeId ? { ...n, className: cls } : n)
            )
        },
        [setNodes]
    )

    /** Reset all nodes to their default class (no exec state) */
    const clearNodeClasses = useCallback(() => {
        setNodes((nds) => nds.map((n) => ({ ...n, className: undefined })))
    }, [setNodes])

    const updateEdgesOnNodeStatus = useCallback((nodeId: string, status: string, output?: any, pluginName?: string) => {
        setEdges((eds) =>
            eds.map((edge) => {
                const newEdge = { ...edge, type: 'smoothstep' }
                if (edge.source === nodeId) {
                    newEdge.animated = (status === 'running' || status === 'success')
                    if (status === 'success' && output) {
                        newEdge.label = pluginName === 'gmail' ? '✉️' : '📦'
                    }
                }
                return newEdge
            })
        )
    }, [setEdges])

    const handleStopExecution = useCallback(() => {
        if (abortCtrlRef.current) {
            abortCtrlRef.current.abort()
            abortCtrlRef.current = null
        }
        setIsExecuting(false)
        showToast('Workflow Execution', 'Flow stopped', '⏹', 'warning')
        clearNodeClasses()
        // Reset all edges to static straight lines and remove labels on stop
        setEdges((eds) => eds.map((e) => ({ ...e, animated: false, label: undefined })))
    }, [clearNodeClasses, setEdges, showToast])

    const handleExecuteFlow = useCallback(async () => {
        if (isExecuting) return

        // Request browser notification permission on user gesture (clicking Run Flow)
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {})
        }

        setIsExecuting(true)
        showToast('Workflow Execution', 'Starting continuous flow loop…', '⏳', 'info')

        // Clear last trigger signatures when starting manually
        lastTriggerSigRef.current = {}

        const parentAbortCtrl = new AbortController()
        abortCtrlRef.current = parentAbortCtrl

        let isFirstRun = true

        try {
            while (!parentAbortCtrl.signal.aborted) {
                // Mark every node as pending before starting this iteration
                setNodes((nds) => nds.map((n) => ({ ...n, className: 'exec-pending' })))
                // Reset all edges to static straight lines and clear labels at the start of each check
                setEdges((eds) => eds.map((e) => ({ ...e, animated: false, label: undefined })))

                const iterationAbortCtrl = new AbortController()
                const onParentAbort = () => iterationAbortCtrl.abort()
                parentAbortCtrl.signal.addEventListener('abort', onParentAbort)

                let isDuplicate = false
                let triggerNodeId = ''

                try {
                    const payload: FlowPayload = { nodes, edges }
                    const stream = executeFlowStream(payload, flowName || 'default', iterationAbortCtrl.signal)

                    for await (const event of stream) {
                        if (event.type === 'node_status') {
                            const cls =
                                event.status === 'running' ? 'exec-running' :
                                    event.status === 'success' ? 'exec-success' :
                                        event.status === 'error' ? 'exec-error' :
                                            'exec-pending'
                            applyNodeClass(event.node_id, cls)
                            
                            // Animate input wires and display data packets on output wires
                            updateEdgesOnNodeStatus(event.node_id, event.status, event.output, event.plugin)

                            if (event.status === 'running') {
                                // Keep TopBar silent and clean during execution
                            }

                            // If Gmail trigger node completes, record latest signature
                            if (event.status === 'success' && event.plugin === 'gmail') {
                                triggerNodeId = event.node_id
                                const output = event.output
                                const sig = String(output?.message_id || output?.id || (output ? JSON.stringify(output) : ''))

                                if (sig) {
                                    lastTriggerSigRef.current[event.node_id] = sig
                                }
                            }
                        } else if (event.type === 'execution_done') {
                            setActivePanel('executions')
                            if (event.status === 'success') {
                                showToast('Workflow Execution', 'Flow completed successfully', '✅', 'success')
                            } else {
                                showToast('Workflow Execution', `Flow failed: ${event.error ?? 'unknown error'}`, '❌', 'error')
                            }
                            // Refresh execution history
                            listExecutions(10).then((execs) => {
                                setExecutions(execs)
                                if (execs[0]) setLastExecution(execs[0])
                            })
                        } else if (event.type === 'execution_error') {
                            showToast('Workflow Execution', `Stream error: ${event.error}`, '❌', 'error')
                        }
                    }
                } catch (err: any) {
                    if (!isDuplicate && err?.name !== 'AbortError') {
                        throw err
                    }
                } finally {
                    parentAbortCtrl.signal.removeEventListener('abort', onParentAbort)
                }

                if (isDuplicate) {
                    // Revert downstream nodes to pending/idle, keep trigger node green
                    setNodes((nds) =>
                        nds.map((n) => {
                            if (n.id === triggerNodeId) return { ...n, className: 'exec-success' }
                            return { ...n, className: undefined }
                        })
                    )
                    if (isFirstRun) {
                        showToast('Gmail Trigger', 'Gmail trigger initialized. Monitoring for new emails…', '📧', 'success')
                    } else {
                        // Keep TopBar silent and clean during polling checks
                    }
                }

                isFirstRun = false

                if (parentAbortCtrl.signal.aborted) {
                    break
                }

                // Poll interval extraction
                const gmailNode = nodes.find((n) => n.data?.plugin === 'gmail')
                const pollIntervalSec = gmailNode?.data?.config?.poll_interval ?? 10

                // Sleep timeout
                await new Promise<void>((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        parentAbortCtrl.signal.removeEventListener('abort', onAbort)
                        resolve()
                    }, pollIntervalSec * 1000)

                    function onAbort() {
                        clearTimeout(timeoutId)
                        reject(new DOMException('Aborted', 'AbortError'))
                    }
                    parentAbortCtrl.signal.addEventListener('abort', onAbort)
                })
            }
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                showToast('Workflow Execution', `Execute error: ${err?.message ?? 'unknown'}`, '❌', 'error')
                clearNodeClasses()
            } else {
                showToast('Workflow Execution', 'Flow stopped', '⏹', 'warning')
            }
        } finally {
            setIsExecuting(false)
            abortCtrlRef.current = null
            // Fade node highlights back to normal after 4 seconds
            setTimeout(() => clearNodeClasses(), 4000)
        }
    }, [nodes, edges, flowName, applyNodeClass, clearNodeClasses, isExecuting, updateEdgesOnNodeStatus, setEdges, showToast])

    // ── Keyboard shortcuts (S=Save, Enter=Execute, N=New, R=Refresh, F=Fit, Alt+1-6=Tabs, Esc=Close) ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape: closes add menu or backs out of plugin config at any time
            if (e.key === 'Escape') {
                setShowFloatingAddMenu(false)
                handleBackToPlugins()
                setMessage('Menus closed')
                return
            }

            const activeTag = document.activeElement?.tagName.toLowerCase()
            if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.getAttribute('contenteditable')) {
                return
            }

            // Ctrl+S: Save Flow
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                handleSaveFlow()
            }

            // Ctrl+Z: Undo
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault()
                handleUndo()
            }

            // Ctrl+Y or Ctrl+Shift+Z: Redo
            if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                e.preventDefault()
                handleRedo()
            }

            // Ctrl+Enter: Execute / Stop flow
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                if (isExecuting) {
                    handleStopExecution()
                } else {
                    handleExecuteFlow()
                }
            }

            // N: New blank workflow
            if (e.key.toLowerCase() === 'n') {
                e.preventDefault()
                handleNewFlow()
            }

            // R: Refresh server and workspace data
            if (e.key.toLowerCase() === 'r') {
                e.preventDefault()
                refreshAll()
            }

            // F: Auto-fit current canvas elements to screen
            if (e.key.toLowerCase() === 'f') {
                e.preventDefault()
                if (rfInstance) {
                    rfInstance.fitView({ duration: 400 })
                    setMessage('Canvas aligned to viewport')
                }
            }

            // Alt + [1-6]: Quick switch right panels
            if (e.altKey) {
                const panels: PanelId[] = ['overview', 'plugins', 'email', 'flows', 'executions', 'logs']
                const index = parseInt(e.key, 10) - 1
                if (index >= 0 && index < panels.length) {
                    e.preventDefault()
                    setActivePanel(panels[index])
                    setMessage(`Switched to panel: ${panels[index]}`)
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleSaveFlow, handleExecuteFlow, handleStopExecution, handleNewFlow, refreshAll, rfInstance, handleBackToPlugins, setShowFloatingAddMenu, isExecuting, flowActive, handleToggleActive, handleUndo, handleRedo])

    // ── Plugin install ─────────────────────────────────────────────────────
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

    // ── Legacy email trigger ───────────────────────────────────────────────
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
        { label: 'Status', value: status?.status ?? '—' },
        { label: 'Plugins', value: String(plugins.length) },
        { label: 'Nodes', value: String(nodes.length) },
        { label: 'Logs', value: String(emailLogs.length) },
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
                        onRun={handleExecuteFlow}
                        onStop={handleStopExecution}
                        isExecuting={isExecuting}
                        schedulerRunning={schedulerRunning}
                        flowActive={flowActive}
                        onToggleActive={() => handleToggleActive(!flowActive)}
                    />

                    {/* Stats strip */}
                    <div className="flex items-center gap-0 shrink-0 overflow-x-auto select-none"
                        style={{ background: '#13131f', borderBottom: '1px solid #1e1e30' }}>
                        {stats.map((s) => {
                            const isClickable = ['Status', 'Plugins', 'Nodes', 'Logs'].includes(s.label)
                            const handleClick = () => {
                                if (s.label === 'Status' || s.label === 'Plugins') {
                                    setActivePanel('plugins')
                                } else if (s.label === 'Logs') {
                                    setActivePanel('logs')
                                } else if (s.label === 'Nodes' && rfInstance) {
                                    rfInstance.fitView({ duration: 400 })
                                    setMessage('Canvas aligned to viewport')
                                }
                            }
                            return (
                                <div key={s.label}
                                    onClick={isClickable ? handleClick : undefined}
                                    className={`flex items-center gap-3 px-5 py-2.5 border-r transition-colors ${isClickable ? 'cursor-pointer hover:bg-[#1e1e30]/50 active:bg-[#1e1e30]' : ''
                                        }`}
                                    style={{ borderColor: '#1e1e30' }}>
                                    <span className="text-xs" style={{ color: '#5555aa' }}>{s.label}</span>
                                    <span className="text-sm font-semibold" style={{ color: '#e0e0ff' }}>{s.value}</span>
                                </div>
                            )
                        })}
                        <div className="flex-1" />
                        <div className="px-4 text-xs" style={{ color: '#3a3a5c' }}>
                            {nodes.length} nodes · {edges.length} edges
                        </div>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 relative min-h-0 overflow-hidden" style={{ minHeight: 0 }} ref={reactFlowWrapper}>
                        {/* Floating Control Panel (Node Inserter + Undo/Redo Action Buttons) */}
                        <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
                            {/* Add Node Panel */}
                            <div className="relative flex flex-col gap-2">
                                <button
                                    onClick={() => setShowFloatingAddMenu(v => !v)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-xl hover:opacity-90 select-none border border-[#2d2d4a]"
                                    style={{ background: 'linear-gradient(135deg,#ff6d5a,#ff4d8d)' }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                                        className={`transition-transform duration-200 ${showFloatingAddMenu ? 'rotate-45' : ''}`}>
                                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    <span>Add Node</span>
                                </button>

                                {showFloatingAddMenu && (
                                    <div className="absolute top-full left-0 mt-2 w-56 max-h-72 overflow-y-auto rounded-xl p-2 shadow-2xl border flex flex-col gap-1.5 animate-toast z-30"
                                        style={{ background: '#13131f', borderColor: '#2d2d4a' }}>
                                        <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider" style={{ color: '#5555aa' }}>
                                            Select Plugin
                                        </div>
                                        <div className="h-px bg-[#1e1e30]" />
                                        {plugins.length === 0 ? (
                                            <div className="px-2 py-3 text-center text-xs" style={{ color: '#3a3a5c' }}>No plugins installed</div>
                                        ) : plugins.map(p => (
                                            <button
                                                key={p.name}
                                                onClick={() => spawnNodeAtCenter(p)}
                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs hover:bg-[#1e1e30] transition-colors"
                                            >
                                                <span className="text-base select-none">{p.icon || '🧩'}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold truncate" style={{ color: '#e0e0ff' }}>{p.display_name || p.name}</div>
                                                    <div className="text-[9px]" style={{ color: '#5555aa' }}>{p.type}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Undo / Redo Actions Button Group */}
                            <div className="flex items-center rounded-xl p-1 shadow-xl border border-[#2d2d4a]" style={{ background: '#13131f' }}>
                                <button
                                    onClick={handleUndo}
                                    disabled={!canUndo}
                                    title="Undo (Ctrl+Z)"
                                    className={`p-2 rounded-lg transition-all text-xs font-semibold flex items-center justify-center select-none ${
                                        canUndo 
                                            ? 'text-[#e0e0ff] hover:bg-[#1e1e30] hover:text-[#ff6d5a] active:scale-95' 
                                            : 'text-[#3a3a5c] cursor-not-allowed opacity-50'
                                    }`}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                        <path d="M3 7v6h6" />
                                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                                    </svg>
                                    <span>Undo</span>
                                </button>
                                <div className="w-px h-4 bg-[#2d2d4a] mx-1" />
                                <button
                                    onClick={handleRedo}
                                    disabled={!canRedo}
                                    title="Redo (Ctrl+Y)"
                                    className={`p-2 rounded-lg transition-all text-xs font-semibold flex items-center justify-center select-none ${
                                        canRedo 
                                            ? 'text-[#e0e0ff] hover:bg-[#1e1e30] hover:text-[#ff6d5a] active:scale-95' 
                                            : 'text-[#3a3a5c] cursor-not-allowed opacity-50'
                                    }`}
                                >
                                    <span>Redo</span>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-1">
                                        <path d="M21 7v6h-6" />
                                        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onInit={(instance) => { setRfInstance(instance); rfInstanceRef.current = instance }}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onNodeClick={onNodeClick}
                            onEdgeClick={onEdgeClick}
                            edgeTypes={edgeTypes}
                            fitView
                            style={{ width: '100%', height: '100%', background: '#0f0f1a' }}
                            zoomOnScroll={!busy}
                            zoomOnPinch={!busy}
                            panOnDrag={!busy}
                            nodesDraggable={!busy}
                            nodesConnectable={!busy}
                            elementsSelectable={!busy}
                            connectOnClick={true}
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
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-50"
                                style={{ background: 'rgba(15,15,26,0.6)' }}>
                                <div className="flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border"
                                    style={{ background: '#1e1e30', borderColor: '#2d2d4a' }}>
                                    <svg className="animate-spin-slow w-5 h-5" style={{ color: '#ff6d5a' }}
                                        fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
                    executions={executions}
                    lastExecution={lastExecution}
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
                    onInstallPath={handleInstallPath}
                    onInstallZip={handleInstallZip}
                    onSendEmail={handleSendEmail}
                    onSaveFlow={handleSaveFlow}
                    onLoadFlow={handleLoadFlow}
                    onExecuteFlow={isExecuting ? handleStopExecution : handleExecuteFlow}
                    isExecuting={isExecuting}
                    busy={busy}
                    flowsList={flowsList}
                    activeFlowId={activeFlowId}
                    onNewFlow={handleNewFlow}
                    onSelectFlow={handleLoadFlow}
                    onDeleteFlow={handleDeleteFlow}
                    selectedPlugin={selectedPlugin}
                    pluginSchema={pluginSchema}
                    pluginCredentials={pluginCredentials}
                    testConnectionResult={testConnectionResult}
                    onSelectConfigurePlugin={handleSelectConfigurePlugin}
                    onUpdateCredentialField={handleUpdateCredentialField}
                    onSavePluginCredentials={handleSavePluginCredentials}
                    onDeletePluginCredentials={handleDeletePluginCredentials}
                    onTestPluginConnection={handleTestPluginConnection}
                    onBackToPlugins={handleBackToPlugins}
                    selectedEdge={selectedEdge}
                    setSelectedEdge={setSelectedEdge}
                    selectedNode={selectedNode}
                    setSelectedNode={setSelectedNode}
                    pluginSchemasCache={pluginSchemasCache}
                    setEdges={setEdges}
                    setNodes={setNodes}
                    nodes={nodes}
                    edges={edges}
                />
                {/* Custom Toast Stack */}
                <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
                    {toasts.map(t => {
                        const levelColors = {
                            info: { bg: 'rgba(19, 19, 31, 0.95)', border: '1px solid #6e6eff33', text: '#e0e0ff', iconBg: '#6e6eff22' },
                            success: { bg: 'rgba(15, 26, 18, 0.95)', border: '1px solid #50fa7b33', text: '#80ff80', iconBg: '#50fa7b22' },
                            warning: { bg: 'rgba(28, 22, 12, 0.95)', border: '1px solid #ffb86c33', text: '#ffb86c', iconBg: '#ffb86c22' },
                            error: { bg: 'rgba(28, 12, 12, 0.95)', border: '1px solid #ff555533', text: '#ff8080', iconBg: '#ff555522' }
                        }
                        const c = levelColors[t.level] || levelColors.info
                        return (
                            <div key={t.id}
                                className="flex items-start gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-md animate-toast pointer-events-auto"
                                style={{ background: c.bg, borderColor: c.border.split(' ')[2], color: c.text }}>
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-lg shrink-0"
                                    style={{ background: c.iconBg }}>
                                    {t.icon || '🔔'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h5 className="text-xs font-bold text-white leading-tight">{t.title}</h5>
                                    <p className="text-[11px] text-[#9999cc] mt-1 leading-normal break-words">{t.message}</p>
                                </div>
                                <button
                                    onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                                    className="text-[#5555aa] hover:text-white transition-colors text-xs font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        </ReactFlowProvider>
    )
}
