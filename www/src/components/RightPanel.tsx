import React from 'react'
import { StatusResponse, PluginItem, ExecutionResult, NodeResult, PluginSchema, BulkPluginSchemas } from '../lib/api'
import { Edge, Node } from 'react-flow-renderer'

interface RightPanelProps {
    activePanel: string
    status: StatusResponse | null
    plugins: PluginItem[]
    emailLogs: any[]
    executions: ExecutionResult[]
    lastExecution: ExecutionResult | null
    installSourcePath: string
    setInstallSourcePath: (v: string) => void
    forceInstall: boolean
    setForceInstall: (v: boolean) => void
    flowName: string
    setFlowName: (v: string) => void
    emailFrom: string
    setEmailFrom: (v: string) => void
    emailSubject: string
    setEmailSubject: (v: string) => void
    onInstallPath: () => void
    onInstallZip: (f: File) => void
    onSendEmail: () => void
    onSaveFlow: () => void
    onLoadFlow: () => void
    onExecuteFlow: () => void
    isExecuting: boolean
    busy: boolean
    flowsList: Array<{ id: string; name: string; nodes_count: number; edges_count: number; updated_at: number }>
    activeFlowId: string | null
    onNewFlow: () => void
    onSelectFlow: (id: string) => void
    onDeleteFlow: (id: string) => void
    selectedPlugin: PluginItem | null
    pluginSchema: PluginSchema | null
    pluginCredentials: Record<string, string>
    testConnectionResult: { ok: boolean; message?: string; error?: string } | null
    onSelectConfigurePlugin: (plugin: PluginItem) => void
    onUpdateCredentialField: (field: string, value: string) => void
    onSavePluginCredentials: () => void
    onDeletePluginCredentials: () => void
    onTestPluginConnection: () => void
    onBackToPlugins: () => void
    
    // Selection states and React Flow helpers
    selectedEdge: Edge | null
    setSelectedEdge: (edge: Edge | null) => void
    selectedNode: Node | null
    setSelectedNode: (node: Node | null) => void
    pluginSchemasCache: BulkPluginSchemas | null
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>
    nodes: Node[]
    edges: Edge[]
}


// ── Reusable sub-components ──────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
    if (!isoString) return ''
    try {
        const date = new Date(isoString)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffSecs = Math.floor(diffMs / 1000)
        const diffMins = Math.floor(diffSecs / 60)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffSecs < 10) return 'just now'
        if (diffSecs < 60) return `${diffSecs}s ago`
        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        return `${diffDays}d ago`
    } catch {
        return ''
    }
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="animate-slide-in">
        <div className="px-4 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: '#1e1e30', background: '#13131f' }}>
            <div className="w-1 h-3.5 rounded bg-gradient-to-b from-[#ff6d5a] to-[#ff4d8d]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#e0e0ff]">{title}</span>
        </div>
        <div className="p-4 space-y-4">{children}</div>
    </div>
)

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-medium mb-1" style={{ color: '#9999cc' }}>{children}</label>
)

const Input = ({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
    <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all"
        style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', color: '#e0e0ff' }}
        onFocus={e => (e.target.style.borderColor = '#ff6d5a')}
        onBlur={e => (e.target.style.borderColor = '#2d2d4a')}
    />
)

const PrimaryBtn = ({ children, onClick, color = '#ff6d5a', disabled }: { children: React.ReactNode; onClick: () => void; color?: string; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}
        className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
        style={{ background: color }}>
        {children}
    </button>
)

const GhostBtn = ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}
        className="w-full py-2 rounded-lg text-sm font-medium transition-all hover:bg-[#1e1e30] disabled:opacity-40"
        style={{ background: '#13131f', border: '1px solid #2d2d4a', color: '#9999cc' }}>
        {children}
    </button>
)

const Pill = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: '#1e1e30' }}>
        <span className="text-xs" style={{ color: '#5555aa' }}>{label}</span>
        <span className="text-xs font-medium" style={{ color: '#e0e0ff' }}>{value || '—'}</span>
    </div>
)

const LogViewerWidget: React.FC<{ filename?: string; height?: string }> = ({ filename = 'email_archive.log', height = '300' }) => {
    const [lines, setLines] = React.useState<string[]>([])
    const [totalLines, setTotalLines] = React.useState(0)
    const [exists, setExists] = React.useState<boolean | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState('')
    const bottomRef = React.useRef<HTMLDivElement>(null)

    const fetchLogs = async () => {
        setLoading(true)
        setError('')
        try {
            const resp = await fetch(`http://localhost:8000/plugins/logs/view?filename=${encodeURIComponent(filename)}`)
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const data = await resp.json()
            setLines(data.lines || [])
            setTotalLines(data.total_lines || 0)
            setExists(data.exists ?? (data.lines?.length > 0))
        } catch (e) {
            setError(String(e))
            setLines([])
        } finally {
            setLoading(false)
        }
    }

    const clearLogs = async () => {
        if (!window.confirm("Are you sure you want to clear the logs?")) return
        setLoading(true)
        setError('')
        try {
            const resp = await fetch(`http://localhost:8000/plugins/logs/clear?filename=${encodeURIComponent(filename)}`, { method: 'POST' })
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            setLines([])
            setTotalLines(0)
        } catch (e) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => { fetchLogs() }, [filename])

    // Auto-scroll to bottom whenever lines change
    React.useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [lines])

    // Parse a JSON log line into structured parts
    const parseLine = (raw: string): { ts?: string; event?: string; level?: string; from?: string; subject?: string; raw: string } => {
        try {
            const obj = JSON.parse(raw)
            return {
                ts: obj.timestamp || obj.ts || '',
                event: obj.event || '',
                level: obj.level || obj.log_level || 'INFO',
                from: obj.data?.from || '',
                subject: obj.data?.subject || '',
                raw,
            }
        } catch { return { raw } }
    }

    // Terminal color per event/level
    const lineColor = (parsed: ReturnType<typeof parseLine>): string => {
        const ev = (parsed.event || '').toLowerCase()
        const lv = (parsed.level || '').toUpperCase()
        if (lv === 'ERROR' || ev.includes('error')) return '#ff5555'
        if (lv === 'WARNING' || ev.includes('warn')) return '#ffb86c'
        if (ev.includes('email') || ev.includes('received')) return '#8be9fd'
        if (ev.includes('data')) return '#50fa7b'
        if (lv === 'DEBUG') return '#6272a4'
        return '#f8f8f2'
    }

    return (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#1e1e30' }}>
            {/* Terminal title bar */}
            <div className="flex items-center justify-between px-3 py-2"
                style={{ background: '#09090f', borderBottom: '1px solid #1e1e30' }}>
                {/* Traffic lights */}
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5555] opacity-80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffb86c] opacity-80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#50fa7b] opacity-80" />
                    <span className="ml-2 text-[10px] font-mono" style={{ color: '#6272a4' }}>
                        root@workflow:~$ tail -f {filename}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono" style={{ color: '#44475a' }}>
                        {totalLines > 0 ? `${totalLines} lines` : 'no data'}
                    </span>
                    <button onClick={fetchLogs} disabled={loading}
                        className="text-[9px] font-bold px-2 py-0.5 rounded transition-all disabled:opacity-40"
                        style={{ color: '#ff6d5a', border: '1px solid #ff6d5a33', background: '#ff6d5a11' }}>
                        {loading ? '⟳ loading' : '⟳ refresh'}
                    </button>
                    <a href={`http://localhost:8000/plugins/logs/download?filename=${encodeURIComponent(filename)}`}
                        target="_blank" rel="noreferrer"
                        className="text-[9px] font-bold px-2 py-0.5 rounded transition-all hover:opacity-80"
                        style={{ color: '#50fa7b', border: '1px solid #50fa7b33', background: '#50fa7b11' }}>
                        ↓ download
                    </a>
                    <button onClick={clearLogs} disabled={loading}
                        className="text-[9px] font-bold px-2 py-0.5 rounded transition-all disabled:opacity-40"
                        style={{ color: '#ff5555', border: '1px solid #ff555533', background: '#ff555511' }}>
                        ✗ clear
                    </button>
                </div>
            </div>

            {/* Terminal body */}
            <div className="overflow-y-auto font-mono text-[10px] leading-5 p-3 space-y-0.5"
                style={{ height: `${height}px`, background: '#05050a' }}>

                {/* Prompt line at top */}
                <div className="text-[9px] mb-2" style={{ color: '#44475a' }}>
                    — showing last {lines.length} of {totalLines} entries —
                </div>

                {error && (
                    <div className="px-2 py-1.5 rounded text-[10px]"
                        style={{ color: '#ff5555', background: '#ff555511', border: '1px solid #ff555533' }}>
                        ✗ {error}
                    </div>
                )}

                {exists === false && !error && (
                    <div className="text-[10px] py-4 text-center" style={{ color: '#44475a' }}>
                        <div className="text-2xl mb-2">📭</div>
                        <div>Log file not found. Run some workflow events to generate logs.</div>
                        <div className="mt-1 font-mono text-[9px]" style={{ color: '#6272a4' }}>
                            Expected: <span style={{ color: '#8be9fd' }}>{filename}</span>
                        </div>
                    </div>
                )}

                {lines.map((raw, i) => {
                    const parsed = parseLine(raw)
                    const color = lineColor(parsed)
                    const lineNum = totalLines - lines.length + i + 1

                    if (parsed.ts) {
                        // Structured JSON log line
                        const ts = parsed.ts.replace('T', ' ').slice(0, 19)
                        return (
                            <div key={i} className="flex items-start gap-2 group hover:bg-[#ffffff05] rounded px-1 -mx-1">
                                <span className="shrink-0 select-none text-[9px] w-6 text-right mt-0.5"
                                    style={{ color: '#44475a' }}>{lineNum}</span>
                                <span className="shrink-0 text-[9px] mt-0.5" style={{ color: '#44475a' }}>{ts}</span>
                                <span className="shrink-0 px-1 rounded text-[8px] font-bold mt-0.5 uppercase"
                                    style={{ color, background: color + '22' }}>
                                    {parsed.event || 'log'}
                                </span>
                                {parsed.from && (
                                    <span className="shrink-0 text-[9px] mt-0.5" style={{ color: '#bd93f9' }}>
                                        {parsed.from}
                                    </span>
                                )}
                                {parsed.subject && (
                                    <span className="flex-1 text-[10px] truncate mt-0.5" style={{ color }}>
                                        {parsed.subject}
                                    </span>
                                )}
                            </div>
                        )
                    }
                    // Plain text line
                    return (
                        <div key={i} className="flex items-start gap-2 hover:bg-[#ffffff05] rounded px-1 -mx-1">
                            <span className="shrink-0 select-none text-[9px] w-6 text-right mt-0.5"
                                style={{ color: '#44475a' }}>{lineNum}</span>
                            <span className="flex-1 break-all" style={{ color }}>{raw}</span>
                        </div>
                    )
                })}

                {/* Blinking cursor at the end */}
                {!loading && lines.length > 0 && (
                    <div className="flex items-center gap-1 pt-1" style={{ color: '#50fa7b' }}>
                        <span style={{ color: '#44475a' }}>$</span>
                        <span className="animate-pulse">█</span>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>
        </div>
    )
}

// ── Node status badge ────────────────────────────────────────────────────────
function NodeStatusBadge({ status }: { status: NodeResult['status'] }) {
    const map: Record<string, { bg: string; label: string }> = {
        success: { bg: '#50fa7b22', label: '✅ success' },
        error:   { bg: '#ff555522', label: '❌ error'   },
        running: { bg: '#ffb86c22', label: '⏳ running' },
        pending: { bg: '#2d2d4a',   label: '⬜ pending' },
    }
    const cfg = map[status] ?? map.pending
    return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: cfg.bg, color: '#e0e0ff' }}>
            {cfg.label}
        </span>
    )
}

// ── Execution card ───────────────────────────────────────────────────────────
function ExecutionCard({ exec, isLatest }: { exec: ExecutionResult; isLatest?: boolean }) {
    const [expanded, setExpanded] = React.useState(isLatest ?? false)
    const successCount = exec.node_results.filter(n => n.status === 'success').length
    const errorCount   = exec.node_results.filter(n => n.status === 'error').length

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${exec.status === 'success' ? '#50fa7b44' : exec.status === 'error' ? '#ff555544' : '#2d2d4a'}` }}>
            {/* Header */}
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[#1e1e30]"
                style={{ background: '#13131f' }}
            >
                <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold" style={{ color: '#e0e0ff' }}>
                        #{exec.execution_id}
                        {isLatest && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#6e6eff33', color: '#6e6eff' }}>LATEST</span>}
                    </span>
                    <span className="text-[10px]" style={{ color: '#5555aa' }} title={exec.started_at ? new Date(exec.started_at).toLocaleString() : ''}>
                        {exec.started_at ? formatRelativeTime(exec.started_at) : ''}
                        {' · '}{successCount}✅ {errorCount > 0 ? `${errorCount}❌` : ''}
                    </span>
                </div>
                <NodeStatusBadge status={exec.status === 'success' ? 'success' : exec.status === 'error' ? 'error' : 'running'} />
            </button>

            {/* Node results */}
            {expanded && (
                <div className="border-t" style={{ borderColor: '#1e1e30' }}>
                    {exec.node_results.length === 0 && (
                        <p className="text-xs px-3 py-2" style={{ color: '#5555aa' }}>No node results.</p>
                    )}
                    {exec.node_results.map((nr) => (
                        <div key={nr.node_id} className="px-3 py-2 border-b last:border-b-0" style={{ borderColor: '#1e1e30', background: '#0f0f1a' }}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium" style={{ color: '#9999cc' }}>{nr.plugin_name || nr.node_id}</span>
                                <NodeStatusBadge status={nr.status} />
                            </div>
                            {nr.error && (
                                <p className="text-[10px] mt-1 px-2 py-1 rounded" style={{ background: '#ff555522', color: '#ff8080' }}>
                                    {nr.error}
                                </p>
                            )}
                            {nr.output && Object.keys(nr.output).length > 0 && (
                                <pre className="text-[10px] mt-1 overflow-auto whitespace-pre-wrap border border-[#1e1e30] p-1.5 rounded" style={{ color: '#9999cc', maxHeight: '160px', background: '#0c0c14' }}>
                                    {JSON.stringify(nr.output, null, 2)}
                                </pre>
                            )}
                        </div>
                    ))}
                    {exec.error && (
                        <div className="px-3 py-2 text-xs" style={{ color: '#ff8080', background: '#ff555511' }}>
                            {exec.error}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

interface ConnectionMappingPanelProps {
    edge: Edge
    onClose: () => void
    pluginSchemasCache: BulkPluginSchemas | null
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
    nodes: Node[]
}

const ConnectionMappingPanel: React.FC<ConnectionMappingPanelProps> = ({ edge, onClose, pluginSchemasCache, setEdges, nodes }) => {
    const sourceNode = nodes.find(n => n.id === edge.source)
    const targetNode = nodes.find(n => n.id === edge.target)

    const sourcePlugin = sourceNode?.data?.plugin || ''
    const targetPlugin = targetNode?.data?.plugin || ''

    const sourceSchema = pluginSchemasCache?.[sourcePlugin]?.publisher || {}
    const targetSchema = pluginSchemasCache?.[targetPlugin]?.subscriber || {}

    const currentMapping = edge.data?.mapping || {}

    const [literals, setLiterals] = React.useState<Record<string, string>>({})
    const [selectedDropdowns, setSelectedDropdowns] = React.useState<Record<string, string>>({})

    React.useEffect(() => {
        const initialDropdowns: Record<string, string> = {}
        const initialLiterals: Record<string, string> = {}

        Object.keys(targetSchema).forEach(targetField => {
            const mappedVal = currentMapping[targetField] || ''
            if (mappedVal.startsWith('@lit:')) {
                initialDropdowns[targetField] = '@lit'
                initialLiterals[targetField] = mappedVal.slice(5)
            } else if (mappedVal) {
                initialDropdowns[targetField] = mappedVal
            } else {
                initialDropdowns[targetField] = ''
            }
        })

        setSelectedDropdowns(initialDropdowns)
        setLiterals(initialLiterals)
    }, [edge, targetSchema, currentMapping])

    const handleDeleteConnection = () => {
        if (confirm("Are you sure you want to delete this wire connection?")) {
            setEdges(eds => eds.filter(e => e.id !== edge.id))
            onClose()
        }
    }

    const handleSaveMapping = () => {
        const newMapping: Record<string, string> = {}
        Object.keys(targetSchema).forEach(targetField => {
            const dropdownVal = selectedDropdowns[targetField]
            if (dropdownVal === '@lit') {
                newMapping[targetField] = `@lit:${literals[targetField] || ''}`
            } else if (dropdownVal) {
                newMapping[targetField] = dropdownVal
            }
        })

        setEdges(eds => eds.map(e => {
            if (e.id === edge.id) {
                return {
                    ...e,
                    data: {
                        ...e.data,
                        mapping: newMapping
                    }
                }
            }
            return e
        }))
        onClose()
    }

    return (
        <div className="animate-slide-in">
            <div className="px-4 py-3.5 flex items-center justify-between border-b" style={{ borderColor: '#1e1e30', background: '#13131f' }}>
                <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 rounded bg-gradient-to-b from-[#ff6d5a] to-[#ff4d8d]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#e0e0ff]">Configure Connection</span>
                </div>
                <button onClick={onClose} className="text-xs text-[#5555aa] hover:text-white transition-colors">✕ Close</button>
            </div>
            
            <div className="p-4 space-y-4">
                <div className="rounded-xl p-3 border leading-relaxed flex items-center justify-between" style={{ background: '#0f0f1a', borderColor: '#2d2d4a' }}>
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{(sourceNode?.data as any)?.icon || '🔌'}</span>
                        <span className="text-xs font-bold text-white">{(sourceNode?.data as any)?.label || sourceNode?.id}</span>
                    </div>
                    <span className="text-xs text-[#5555aa]">→</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{(targetNode?.data as any)?.icon || '🔌'}</span>
                        <span className="text-xs font-bold text-white">{(targetNode?.data as any)?.label || targetNode?.id}</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <h5 className="text-xs font-bold text-[#e0e0ff]">Manual Field Mapping</h5>
                    <p className="text-[10px]" style={{ color: '#9999cc' }}>
                        Map fields from the publisher (upstream) to the subscriber (downstream). 
                        Leave as "—" to use the node's saved configuration.
                    </p>

                    {Object.keys(targetSchema).length === 0 ? (
                        <div className="py-4 text-center text-xs text-[#3a3a5c] border border-dashed border-[#2d2d4a] rounded-lg">
                            Target plugin has no subscriber fields.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(targetSchema).map(([targetField, fieldType]) => {
                                const dropdownVal = selectedDropdowns[targetField] || ''
                                return (
                                    <div key={targetField} className="p-2.5 rounded-lg border space-y-2" style={{ background: '#0b0b14', borderColor: '#1e1e30' }}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white">{targetField}</span>
                                            <span className="text-[9px] px-1 rounded uppercase font-bold" style={{ color: '#5555aa', background: '#5555aa1a' }}>{String(fieldType)}</span>
                                        </div>

                                        <select
                                            value={dropdownVal}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                setSelectedDropdowns(prev => ({ ...prev, [targetField]: val }))
                                            }}
                                            className="w-full px-2 py-1.5 rounded-md text-xs bg-[#0f0f1a] border border-[#2d2d4a] text-[#e0e0ff] outline-none"
                                        >
                                            <option value="">— (use config)</option>
                                            <option value="@lit">✍️ Hardcoded Literal String</option>
                                            <optgroup label={`Publisher Fields (${sourcePlugin})`}>
                                                {Object.keys(sourceSchema).map(sourceField => (
                                                    <option key={sourceField} value={sourceField}>
                                                        {sourceField} (Type: {sourceSchema[sourceField]})
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </select>

                                        {dropdownVal === '@lit' && (
                                            <input
                                                type="text"
                                                placeholder="Enter literal string value..."
                                                value={literals[targetField] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    setLiterals(prev => ({ ...prev, [targetField]: val }))
                                                }}
                                                className="w-full px-2.5 py-1 rounded text-xs outline-none bg-[#0f0f1a] border border-[#2d2d4a] text-[#e0e0ff]"
                                            />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t space-y-2" style={{ borderColor: '#1e1e30' }}>
                    <PrimaryBtn onClick={handleSaveMapping} color="#50fa7b">
                        <span style={{ color: '#0f0f1a' }}>Save Mapping</span>
                    </PrimaryBtn>
                    <GhostBtn onClick={handleDeleteConnection}>
                        <span className="text-[#ff5555]">🗑 Delete Connection</span>
                    </GhostBtn>
                </div>
            </div>
        </div>
    )
}

interface NodeTogglesPanelProps {
    node: Node
    onClose: () => void
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>
    plugins: PluginItem[]
}

const NodeTogglesPanel: React.FC<NodeTogglesPanelProps> = ({ node, onClose, setNodes, plugins }) => {
    const pluginName = node.data?.plugin || ''
    const pluginInfo = plugins.find(p => p.name === pluginName)

    const isPublisherEnabled = node.data?.publisher_enabled !== false
    const isSubscriberEnabled = node.data?.subscriber_enabled !== false

    const handleTogglePublisher = (enabled: boolean) => {
        setNodes(nds => nds.map(n => {
            if (n.id === node.id) {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        publisher_enabled: enabled
                    }
                }
            }
            return n
        }))
    }

    const handleToggleSubscriber = (enabled: boolean) => {
        setNodes(nds => nds.map(n => {
            if (n.id === node.id) {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        subscriber_enabled: enabled
                    }
                }
            }
            return n
        }))
    }

    return (
        <div className="animate-slide-in">
            <div className="px-4 py-3.5 flex items-center justify-between border-b" style={{ borderColor: '#1e1e30', background: '#13131f' }}>
                <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 rounded bg-gradient-to-b from-[#ff6d5a] to-[#ff4d8d]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#e0e0ff]">Configure Node</span>
                </div>
                <button onClick={onClose} className="text-xs text-[#5555aa] hover:text-white transition-colors">✕ Close</button>
            </div>

            <div className="p-4 space-y-4">
                <div className="rounded-xl p-3 border leading-relaxed flex items-center gap-3" style={{ background: '#0f0f1a', borderColor: '#2d2d4a' }}>
                    <span className="text-3xl select-none">{pluginInfo?.icon || '🧩'}</span>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{pluginInfo?.display_name || pluginName}</h4>
                        <p className="text-[10px] line-clamp-2 mt-0.5" style={{ color: '#9999cc' }}>{pluginInfo?.description}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h5 className="text-xs font-bold text-[#e0e0ff]">Capability Toggles</h5>

                    <div className="flex items-center justify-between p-3 rounded-lg border" style={{ background: '#0b0b14', borderColor: '#1e1e30' }}>
                        <div className="flex-1 pr-2">
                            <span className="text-xs font-bold text-white block">Subscriber Capability</span>
                            <span className="text-[9px] mt-0.5 block" style={{ color: '#5555aa' }}>
                                Allow this node to receive inputs and process messages.
                            </span>
                        </div>
                        <input
                            type="checkbox"
                            checked={isSubscriberEnabled}
                            onChange={(e) => handleToggleSubscriber(e.target.checked)}
                            className="w-4 h-4 rounded cursor-pointer accent-[#ff6d5a]"
                        />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border" style={{ background: '#0b0b14', borderColor: '#1e1e30' }}>
                        <div className="flex-1 pr-2">
                            <span className="text-xs font-bold text-white block">Publisher Capability</span>
                            <span className="text-[9px] mt-0.5 block" style={{ color: '#5555aa' }}>
                                Allow this node to emit outputs downstream.
                            </span>
                        </div>
                        <input
                            type="checkbox"
                            checked={isPublisherEnabled}
                            onChange={(e) => handleTogglePublisher(e.target.checked)}
                            className="w-4 h-4 rounded cursor-pointer accent-[#ff6d5a]"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RightPanel(props: RightPanelProps) {
    const { 
        activePanel, 
        status, 
        plugins, 
        emailLogs, 
        executions, 
        lastExecution, 
        busy, 
        flowsList, 
        activeFlowId, 
        onNewFlow, 
        onSelectFlow, 
        onDeleteFlow, 
        selectedPlugin, 
        pluginSchema, 
        pluginCredentials, 
        testConnectionResult, 
        onSelectConfigurePlugin, 
        onUpdateCredentialField, 
        onSavePluginCredentials, 
        onDeletePluginCredentials, 
        onTestPluginConnection, 
        onBackToPlugins,
        selectedEdge,
        setSelectedEdge,
        selectedNode,
        setSelectedNode,
        pluginSchemasCache,
        setEdges,
        setNodes,
        nodes,
        edges
    } = props


    const [activeConfigMenuId, setActiveConfigMenuId] = React.useState<string | null>(null)
    const [width, setWidth] = React.useState(() => {
        const saved = localStorage.getItem('right-panel-width')
        return saved ? parseInt(saved, 10) : 320
    })
    const [isResizing, setIsResizing] = React.useState(false)
    const [isHovered, setIsHovered] = React.useState(false)

    const startResizing = React.useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        setIsResizing(true)
    }, [])

    React.useEffect(() => {
        if (!isResizing) return

        const handleMouseMove = (e: MouseEvent) => {
            const newWidth = window.innerWidth - e.clientX
            // enforce min width 260px and max 800px (or 60% of viewport)
            const boundedWidth = Math.max(260, Math.min(newWidth, Math.floor(window.innerWidth * 0.6)))
            setWidth(boundedWidth)
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 0) return
            const newWidth = window.innerWidth - e.touches[0].clientX
            const boundedWidth = Math.max(260, Math.min(newWidth, Math.floor(window.innerWidth * 0.6)))
            setWidth(boundedWidth)
        }

        const handleMouseUp = () => {
            setIsResizing(false)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('touchmove', handleTouchMove, { passive: false })
        document.addEventListener('touchend', handleMouseUp)
        
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleMouseUp)
        }
    }, [isResizing])

    React.useEffect(() => {
        localStorage.setItem('right-panel-width', String(width))
    }, [width])

    React.useEffect(() => {
        if (pluginSchema?.config_menus && pluginSchema.config_menus.length > 0) {
            setActiveConfigMenuId(pluginSchema.config_menus[0].id)
        } else {
            setActiveConfigMenuId(null)
        }
    }, [pluginSchema])

    // Drag start handler for plugin cards
    const handlePluginDragStart = (e: React.DragEvent, plugin: PluginItem) => {
        e.dataTransfer.setData('application/workflow-plugin-name', plugin.name)
        e.dataTransfer.setData('application/workflow-plugin-label', plugin.display_name || plugin.name)
        e.dataTransfer.setData('application/workflow-plugin-icon', plugin.icon || '🧩')
        e.dataTransfer.effectAllowed = 'move'
    }

    return (
        <aside className="relative h-full shrink-0 flex flex-col"
            style={{ width: `${width}px`, background: '#13131f', borderLeft: '1px solid #1e1e30' }}>
            
            {/* Resizer Handle */}
            <div
                onMouseDown={startResizing}
                onTouchStart={startResizing}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="absolute top-0 left-0 w-3.5 h-full cursor-col-resize z-50 select-none"
                style={{
                    transform: 'translateX(-7px)',
                }}
            >
                {/* Thin visual line inside resizer handle */}
                <div 
                    className="w-[2px] h-full mx-auto transition-colors duration-150"
                    style={{
                        background: isResizing ? '#ff6d5a' : isHovered ? '#ff6d5a66' : 'transparent',
                    }}
                />
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto h-full w-full">

            {/* ── CONNECTION MAPPING ── */}
            {selectedEdge && (
                <ConnectionMappingPanel
                    edge={selectedEdge}
                    onClose={() => setSelectedEdge(null)}
                    pluginSchemasCache={pluginSchemasCache}
                    setEdges={setEdges}
                    nodes={nodes}
                />
            )}

            {/* ── NODE TOGGLES ── */}
            {selectedNode && !selectedEdge && (
                <NodeTogglesPanel
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    setNodes={setNodes}
                    plugins={plugins}
                />
            )}

            {!selectedEdge && !selectedNode && (
                <>
                {/* ── OVERVIEW ── */}
                {activePanel === 'overview' && (

                <Section title="Overview">
                    <Pill label="API Status" value={status?.status ?? 'unknown'} />
                    <Pill label="Plugins loaded" value={String(status?.plugins_loaded ?? 0)} />
                    <Pill label="Event listeners" value={Object.entries(status?.event_listeners ?? {}).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'} />
                    <Pill label="Total plugins" value={String(plugins.length)} />
                    <Pill label="Email logs" value={String(emailLogs.length)} />

                    {/* Status card */}
                    <div className="mt-2 rounded-lg p-3" style={{ background: '#0f0f1a', border: '1px solid #2d2d4a' }}>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${status?.status === 'ok' ? 'bg-[#50fa7b]' : 'bg-[#ff6d5a]'}`} />
                            <span className="text-xs font-semibold" style={{ color: '#e0e0ff' }}>
                                {status?.status === 'ok' ? 'All systems operational' : 'System status unknown'}
                            </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed" style={{ color: '#5555aa' }}>
                            Manage plugins, trigger email events and design visual flows from a single workspace.
                        </p>
                    </div>

                    {/* Quick action */}
                    <PrimaryBtn onClick={props.onExecuteFlow} disabled={busy} color="linear-gradient(135deg,#ff6d5a,#ff4d8d)">
                        ▶ Execute Current Flow
                    </PrimaryBtn>
                </Section>
            )}

            {/* ── PLUGINS ── */}
            {activePanel === 'plugins' && (
                selectedPlugin && pluginSchema ? (
                    <Section title={`Configure ${selectedPlugin.display_name || selectedPlugin.name}`}>
                        <button
                            onClick={onBackToPlugins}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border select-none mb-4 bg-[#1e1e30] border-[#2d2d4a] text-[#9999cc] hover:text-white hover:bg-[#2d2d4a] active:scale-95"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                            Back to Plugins
                        </button>
                        
                        <div className="flex items-center gap-3 p-3 rounded-lg border mb-4" style={{ background: '#0f0f1a', borderColor: '#2d2d4a' }}>
                            <span className="text-3xl select-none">{selectedPlugin.icon || '🧩'}</span>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-white truncate">{selectedPlugin.display_name || selectedPlugin.name}</h4>
                                <p className="text-[10px] line-clamp-2 mt-0.5" style={{ color: '#9999cc' }}>{selectedPlugin.description}</p>
                            </div>
                        </div>
                        
                        {pluginSchema.config_menus && pluginSchema.config_menus.length > 0 && (
                            <div className="flex gap-1 p-1 rounded-lg bg-[#0f0f1a] border border-[#2d2d4a] mb-4 select-none">
                                {pluginSchema.config_menus.map((menu) => (
                                    <button
                                        key={menu.id}
                                        onClick={() => setActiveConfigMenuId(menu.id)}
                                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                                            activeConfigMenuId === menu.id
                                                ? 'bg-[#1e1e30] text-[#ff6d5a] border border-[#ff6d5a33]'
                                                : 'text-[#9999cc] hover:text-[#e0e0ff]'
                                        }`}
                                    >
                                        {menu.icon && <span>{menu.icon}</span>}
                                        <span>{menu.title}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        <div className="space-y-4">
                            {pluginSchema.config_elements && pluginSchema.config_elements.length > 0 ? (
                                pluginSchema.config_elements
                                    .filter(elem => !pluginSchema.config_menus || pluginSchema.config_menus.length === 0 || elem.menu_id === activeConfigMenuId)
                                    .map((elem, idx) => {

                                        // ── FIELD ─────────────────────────────────────────
                                        if (elem.element_type === 'field') {
                                            const fieldKey = `field-${elem.name}-${idx}`
                                            const currentVal = pluginCredentials[elem.name] || ''

                                            let inputEl: React.ReactNode

                                            if (elem.type === 'boolean') {
                                                const checked = currentVal === 'true' || currentVal === true as any
                                                inputEl = (
                                                    <label className="flex items-center gap-3 cursor-pointer select-none">
                                                        <div className="relative shrink-0">
                                                            <input type="checkbox" className="sr-only"
                                                                checked={checked}
                                                                onChange={e => onUpdateCredentialField(elem.name, String(e.target.checked))}
                                                            />
                                                            <div className="w-9 h-5 rounded-full transition-colors"
                                                                style={{ background: checked ? '#ff6d5a' : '#2d2d4a' }} />
                                                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
                                                        </div>
                                                        <span className="text-xs" style={{ color: '#9999cc' }}>
                                                            {checked ? 'Enabled' : 'Disabled'}
                                                        </span>
                                                    </label>
                                                )
                                            } else if (elem.type === 'select' && elem.options && elem.options.length > 0) {
                                                inputEl = (
                                                    <select
                                                        value={currentVal}
                                                        onChange={e => onUpdateCredentialField(elem.name, e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all appearance-none cursor-pointer"
                                                        style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', color: currentVal ? '#e0e0ff' : '#5555aa' }}
                                                        onFocus={e => (e.target.style.borderColor = '#ff6d5a')}
                                                        onBlur={e => (e.target.style.borderColor = '#2d2d4a')}
                                                    >
                                                        <option value="" style={{ background: '#0f0f1a' }}>
                                                            {elem.placeholder || `Select ${elem.display_name || elem.name}…`}
                                                        </option>
                                                        {elem.options.map(opt => (
                                                            <option key={opt} value={opt} style={{ background: '#0f0f1a' }}>{opt}</option>
                                                        ))}
                                                    </select>
                                                )
                                            } else if (elem.type === 'text') {
                                                inputEl = (
                                                    <textarea
                                                        value={currentVal}
                                                        placeholder={elem.placeholder || `Enter ${elem.display_name || elem.name}`}
                                                        onChange={e => onUpdateCredentialField(elem.name, e.target.value)}
                                                        rows={4}
                                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all resize-none"
                                                        style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', color: '#e0e0ff' }}
                                                        onFocus={e => (e.target.style.borderColor = '#ff6d5a')}
                                                        onBlur={e => (e.target.style.borderColor = '#2d2d4a')}
                                                    />
                                                )
                                            } else if (elem.type === 'number') {
                                                inputEl = (
                                                    <input
                                                        type="number"
                                                        value={currentVal}
                                                        placeholder={elem.placeholder || `Enter ${elem.display_name || elem.name}`}
                                                        onChange={e => onUpdateCredentialField(elem.name, e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all"
                                                        style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', color: '#e0e0ff' }}
                                                        onFocus={e => (e.target.style.borderColor = '#ff6d5a')}
                                                        onBlur={e => (e.target.style.borderColor = '#2d2d4a')}
                                                    />
                                                )
                                            } else {
                                                // string | password | credential | fallback
                                                inputEl = (
                                                    <Input
                                                        type={elem.type === 'password' ? 'password' : 'text'}
                                                        value={currentVal}
                                                        onChange={val => onUpdateCredentialField(elem.name, val)}
                                                        placeholder={elem.placeholder || `Enter ${elem.display_name || elem.name}`}
                                                    />
                                                )
                                            }

                                            return (
                                                <div key={fieldKey} className="space-y-1.5">
                                                    {elem.type !== 'boolean' && (
                                                        <div className="flex justify-between items-center">
                                                            <Label>{elem.display_name || elem.name}</Label>
                                                            {elem.required && <span className="text-[9px] text-[#ff6d5a] uppercase font-bold select-none">Required</span>}
                                                        </div>
                                                    )}
                                                    {elem.type === 'boolean' && (
                                                        <div className="flex justify-between items-center mb-1">
                                                            <Label>{elem.display_name || elem.name}</Label>
                                                            {elem.required && <span className="text-[9px] text-[#ff6d5a] uppercase font-bold select-none">Required</span>}
                                                        </div>
                                                    )}
                                                    {inputEl}
                                                    {elem.description && (
                                                        <p className="text-[9px] leading-relaxed" style={{ color: '#5555aa' }}>{elem.description}</p>
                                                    )}
                                                </div>
                                            )

                                        // ── BUTTON ────────────────────────────────────────
                                        } else if (elem.element_type === 'button') {
                                            const handleClick = async () => {
                                                if (elem.type === 'save') {
                                                    onSavePluginCredentials()
                                                } else if (elem.type === 'test') {
                                                    onTestPluginConnection()
                                                } else if (elem.type === 'clear') {
                                                    onDeletePluginCredentials()
                                                } else if (elem.type === 'oauth_google') {
                                                    const clientId = pluginCredentials['client_id'];
                                                    const clientSecret = pluginCredentials['client_secret'];
                                                    if (!clientId || !clientSecret) {
                                                        alert('Please enter both OAuth2 Client ID and OAuth2 Client Secret first.');
                                                        return;
                                                    }
                                                    try {
                                                        const resp = await fetch(`http://localhost:8000/plugins/gmail/auth-url?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`);
                                                        const data = await resp.json();
                                                        if (data.auth_url) {
                                                            window.location.href = data.auth_url;
                                                        } else {
                                                            alert('Failed to obtain Google authentication URL.');
                                                        }
                                                    } catch (e) {
                                                        alert('Failed to connect to backend server: ' + e);
                                                    }
                                                } else if (elem.type === 'download') {
                                                    const fname = (elem as any).action || 'email_archive.log';
                                                    window.open(`http://localhost:8000/plugins/logs/download?filename=${encodeURIComponent(fname)}`, '_blank');
                                                }
                                            }

                                            const isBtnDisabled = busy || (!['oauth_google', 'download'].includes(elem.type) && (!pluginSchema.config_schema || pluginSchema.config_schema.length === 0));

                                            const buttonJsx = elem.type === 'oauth_google' ? (
                                                <button onClick={handleClick}
                                                    className="w-full mt-1 py-2 rounded-lg text-xs font-bold text-white transition-all bg-gradient-to-r from-[#4285f4] to-[#34a853] hover:opacity-90 active:scale-95 shadow-sm flex items-center justify-center gap-2">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                                    </svg>
                                                    {elem.display_name}
                                                </button>
                                            ) : elem.style === 'primary' ? (
                                                <button onClick={handleClick} disabled={isBtnDisabled}
                                                    className="w-full py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                                                    style={{ background: '#50fa7b', color: '#0f0f1a' }}>
                                                    {elem.display_name}
                                                </button>
                                            ) : elem.style === 'ghost' ? (
                                                <button onClick={handleClick} disabled={isBtnDisabled}
                                                    className="w-full py-2 rounded-lg text-sm font-medium transition-all hover:bg-[#1e1e30] disabled:opacity-40"
                                                    style={{ background: '#13131f', border: '1px solid #2d2d4a', color: '#9999cc' }}>
                                                    {elem.display_name}
                                                </button>
                                            ) : elem.style === 'danger' ? (
                                                <button onClick={handleClick} disabled={isBtnDisabled}
                                                    className="w-full py-2 text-center rounded-lg text-xs font-semibold bg-[#ff555515] hover:bg-[#ff555525] border border-[#ff555533] hover:border-[#ff555555] text-[#ff8080] transition-all active:scale-95">
                                                    {elem.display_name}
                                                </button>
                                            ) : (
                                                <button onClick={handleClick} disabled={isBtnDisabled}
                                                    className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                                                    style={{ background: '#6e6eff' }}>
                                                    {elem.display_name}
                                                </button>
                                            );

                                            if (elem.description) {
                                                return (
                                                    <div key={`btn-${elem.id || idx}`} className="p-3.5 rounded-lg border mt-2 select-none flex flex-col gap-2 bg-[#0f0f1a] border-[#2d2d4a]">
                                                        <div className="flex items-start gap-2.5">
                                                            <span className="text-xl">{elem.icon || '🧩'}</span>
                                                            <div className="flex-1">
                                                                <h5 className="text-xs font-semibold text-[#e0e0ff]">{elem.display_name}</h5>
                                                                <p className="text-[10px] text-[#9999cc] mt-0.5 leading-normal">{elem.description}</p>
                                                            </div>
                                                        </div>
                                                        {buttonJsx}
                                                    </div>
                                                )
                                            }
                                            return <div key={`btn-${elem.id || idx}`} className="pt-1">{buttonJsx}</div>

                                        // ── DIVIDER ───────────────────────────────────────
                                        } else if (elem.element_type === 'divider') {
                                            return (
                                                <div key={`div-${idx}`} className="border-t my-1" style={{ borderColor: '#1e1e30' }} />
                                            )

                                        // ── HEADING ───────────────────────────────────────
                                        } else if (elem.element_type === 'heading') {
                                            return (
                                                <div key={`h-${idx}`} className="pt-1">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#5555aa' }}>
                                                        {elem.text}
                                                    </span>
                                                </div>
                                            )

                                        // ── INFO ──────────────────────────────────────────
                                        } else if (elem.element_type === 'info') {
                                            const infoStyles: Record<string, { bg: string; border: string; color: string; icon: string }> = {
                                                info:    { bg: '#6e6eff11', border: '#6e6eff33', color: '#9999ff', icon: 'ℹ️' },
                                                warning: { bg: '#ffb86c11', border: '#ffb86c33', color: '#ffb86c', icon: '⚠️' },
                                                success: { bg: '#50fa7b11', border: '#50fa7b33', color: '#80ff80', icon: '✅' },
                                                error:   { bg: '#ff555511', border: '#ff555533', color: '#ff8080', icon: '❌' },
                                            }
                                            const s = infoStyles[elem.style || 'info'] || infoStyles.info
                                            return (
                                                <div key={`info-${idx}`} className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs leading-relaxed border"
                                                    style={{ background: s.bg, borderColor: s.border, color: s.color }}>
                                                    <span className="shrink-0 select-none">{elem.icon || s.icon}</span>
                                                    <span className="flex-1">{elem.text}</span>
                                                </div>
                                            )
                                        } else if (elem.element_type === 'log_viewer') {
                                            return (
                                                <div key={`lv-${idx}`}>
                                                    <LogViewerWidget filename={elem.filename} height={elem.height} />
                                                </div>
                                            )
                                        }

                                        return null
                                    })

                            ) : (
                                <>
                                    {pluginSchema.config_schema && pluginSchema.config_schema.length > 0 ? (
                                        pluginSchema.config_schema
                                            .filter(field => !pluginSchema.config_menus || pluginSchema.config_menus.length === 0 || field.menu_id === activeConfigMenuId)
                                            .map((field) => (
                                                <div key={field.name} className="space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <Label>{field.display_name || field.name}</Label>
                                                        {field.required && <span className="text-[9px] text-[#ff6d5a] uppercase font-bold select-none">Required</span>}
                                                    </div>
                                                    <Input
                                                        type={field.type === 'password' ? 'password' : 'text'}
                                                        value={pluginCredentials[field.name] || ''}
                                                        onChange={(val) => onUpdateCredentialField(field.name, val)}
                                                        placeholder={field.placeholder || `Enter ${field.display_name || field.name}`}
                                                    />
                                                    {field.description && (
                                                        <p className="text-[9px]" style={{ color: '#5555aa' }}>{field.description}</p>
                                                    )}
                                                </div>
                                            ))
                                    ) : (
                                        <p className="text-xs py-4 text-center" style={{ color: '#3a3a5c' }}>This plugin does not require any credentials or settings.</p>
                                    )}

                                    {selectedPlugin.name === 'gmail' && (
                                        <div className="p-3.5 rounded-lg border mt-2 select-none flex flex-col gap-2 bg-[#0f0f1a] border-[#2d2d4a]">
                                            <div className="flex items-start gap-2.5">
                                                <span className="text-xl">🔑</span>
                                                <div className="flex-1">
                                                    <h5 className="text-xs font-semibold text-[#e0e0ff]">Authorize Google Account</h5>
                                                    <p className="text-[10px] text-[#9999cc] mt-0.5 leading-normal">
                                                        {pluginSchema.config_menus && pluginSchema.config_menus.length > 0
                                                            ? 'Click below to authorize and link your real Gmail inbox securely using the API credentials configured in the first tab.'
                                                            : 'Enter your Client ID and Client Secret above, then click below to authorize and link your real Gmail inbox securely.'
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const clientId = pluginCredentials['client_id'];
                                                    const clientSecret = pluginCredentials['client_secret'];
                                                    if (!clientId || !clientSecret) {
                                                        alert('Please enter both OAuth2 Client ID and OAuth2 Client Secret first.');
                                                        return;
                                                    }
                                                    try {
                                                        const resp = await fetch(`http://localhost:8000/plugins/gmail/auth-url?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`);
                                                        const data = await resp.json();
                                                        if (data.auth_url) {
                                                            window.location.href = data.auth_url;
                                                        } else {
                                                            alert('Failed to obtain Google authentication URL.');
                                                        }
                                                    } catch (e) {
                                                        alert('Failed to connect to backend server: ' + e);
                                                    }
                                                }}
                                                className="w-full mt-1 py-2 rounded-lg text-xs font-bold text-white transition-all bg-gradient-to-r from-[#4285f4] to-[#34a853] hover:opacity-90 active:scale-95 shadow-sm flex items-center justify-center gap-2"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                                </svg>
                                                Link Google Account
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex gap-2 pt-2">
                                        <GhostBtn onClick={onTestPluginConnection} disabled={busy || !pluginSchema.config_schema || pluginSchema.config_schema.length === 0}>
                                            🧪 Test
                                        </GhostBtn>
                                        <PrimaryBtn onClick={onSavePluginCredentials} disabled={busy || !pluginSchema.config_schema || pluginSchema.config_schema.length === 0} color="#50fa7b">
                                            <span style={{ color: '#0f0f1a' }}>Save Config</span>
                                        </PrimaryBtn>
                                    </div>

                                    {pluginSchema.config_schema && pluginSchema.config_schema.length > 0 && (
                                        <button
                                            onClick={onDeletePluginCredentials}
                                            disabled={busy}
                                            className="w-full py-2 text-center rounded-lg text-xs font-semibold bg-[#ff555515] hover:bg-[#ff555525] border border-[#ff555533] hover:border-[#ff555555] text-[#ff8080] transition-all active:scale-95 mt-1.5"
                                        >
                                            Clear Config
                                        </button>
                                    )}
                                </>
                            )}

                            {testConnectionResult && (
                                <div className="rounded-lg p-3 text-xs border animate-toast"
                                    style={{
                                        background: testConnectionResult.ok ? '#50fa7b11' : '#ff555511',
                                        borderColor: testConnectionResult.ok ? '#50fa7b44' : '#ff555544',
                                        color: testConnectionResult.ok ? '#80ff80' : '#ff8080'
                                    }}
                                >
                                    <strong>{testConnectionResult.ok ? '✅ Connection OK' : '❌ Connection Failed'}</strong>
                                    <p className="mt-1 text-[10px] whitespace-pre-wrap">{testConnectionResult.message || testConnectionResult.error}</p>
                                </div>
                            )}
                        </div>
                    </Section>
                ) : (
                    <Section title="Plugin Manager">
                        <div>
                            <Label>Folder path</Label>
                            <Input value={props.installSourcePath} onChange={props.setInstallSourcePath}
                                placeholder="external_plugins/sample" />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <div className="relative">
                                <input type="checkbox" className="sr-only" checked={props.forceInstall}
                                    onChange={(e) => props.setForceInstall(e.target.checked)} />
                                <div className="w-8 h-4 rounded-full transition-colors"
                                    style={{ background: props.forceInstall ? '#ff6d5a' : '#2d2d4a' }} />
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${props.forceInstall ? 'translate-x-4' : ''}`} />
                            </div>
                            <span className="text-xs" style={{ color: '#9999cc' }}>Force overwrite</span>
                        </label>

                        <PrimaryBtn onClick={props.onInstallPath} disabled={busy} color="#6e6eff">
                            Install from path
                        </PrimaryBtn>

                        <div className="border-t pt-3" style={{ borderColor: '#1e1e30' }}>
                            <Label>Upload ZIP</Label>
                            <input type="file" accept=".zip"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onInstallZip(f) }}
                                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#2d2d4a] hover:file:bg-[#3a3a5c] file:text-[#e0e0ff] file:cursor-pointer transition-all"
                                style={{ color: '#9999cc' }}
                            />
                        </div>

                        {/* Installed plugins — draggable */}
                        <div className="border-t pt-3 space-y-2" style={{ borderColor: '#1e1e30' }}>
                            <div className="flex items-center justify-between">
                                <Label>Installed plugins ({plugins.length})</Label>
                                <span className="text-[10px]" style={{ color: '#3a3a5c' }}>drag to canvas</span>
                            </div>
                            {plugins.length === 0 ? (
                                <p className="text-xs py-4 text-center" style={{ color: '#3a3a5c' }}>No plugins installed</p>
                            ) : plugins.map((p) => (
                                <div
                                    key={p.name}
                                    draggable
                                    onDragStart={(e) => handlePluginDragStart(e, p)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-all border border-[#2d2d4a] hover:border-[#ff6d5a55]"
                                    style={{ background: '#0f0f1a' }}
                                    title={`Drag to canvas to add ${p.display_name || p.name}`}
                                >
                                    <span className="text-base select-none">{p.icon || '🧩'}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold truncate text-[#e0e0ff]">
                                            {p.display_name || p.name}
                                        </div>
                                        {p.description && (
                                            <div className="text-[10px] line-clamp-2 mt-0.5" style={{ color: '#9999cc' }} title={p.description}>
                                                {p.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1 items-end select-none shrink-0">
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" 
                                            style={p.type === 'trigger' ? { background: '#ff6d5a22', color: '#ff6d5a' } : { background: '#6e6eff22', color: '#6e6eff' }}>
                                            {p.type.toUpperCase()}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onSelectConfigurePlugin(p) }}
                                            className="text-xs font-semibold text-[#9999cc] hover:text-white bg-[#1e1e30] hover:bg-[#ff6d5a] border border-[#2d2d4a] hover:border-[#ff6d5a] px-3 py-1 rounded-lg transition-all shadow-sm flex items-center gap-1 active:scale-95 shrink-0"
                                            title={`Configure ${p.display_name || p.name}`}
                                        >
                                            <span>⚙️</span> Config
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )
            )}

            {/* ── EMAIL ── */}
            {activePanel === 'email' && (
                <Section title="Email Trigger">
                    <div>
                        <Label>From address</Label>
                        <Input value={props.emailFrom} onChange={props.setEmailFrom} placeholder="alice@example.com" />
                    </div>
                    <div>
                        <Label>Subject</Label>
                        <Input value={props.emailSubject} onChange={props.setEmailSubject} placeholder="Hello from workflow" />
                    </div>
                    <PrimaryBtn onClick={props.onSendEmail} disabled={busy} color="#ff4d8d">
                        Send email event
                    </PrimaryBtn>
                    <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', color: '#5555aa' }}>
                        Triggers <code className="text-[#ff6d5a]">POST /email/send</code> and routes through the automation bus.
                    </div>
                </Section>
            )}

            {/* ── FLOWS ── */}
            {activePanel === 'flows' && (
                <Section title="Flow Manager">
                    <button
                        onClick={onNewFlow}
                        disabled={busy}
                        className="w-full py-2 px-3 rounded-lg text-xs font-bold border border-dashed text-[#ff6d5a] border-[#ff6d5a] hover:bg-[#ff6d5a11] transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                        <span>➕</span> Create New Workflow
                    </button>

                    <div className="border-t pt-3" style={{ borderColor: '#1e1e30' }}>
                        <Label>Flow name</Label>
                        <Input value={props.flowName} onChange={props.setFlowName} placeholder="My Automation Flow" />
                    </div>

                    <PrimaryBtn 
                        onClick={props.onExecuteFlow} 
                        disabled={busy && !props.isExecuting} 
                        color={props.isExecuting ? 'linear-gradient(135deg,#ff5555,#ff3333)' : 'linear-gradient(135deg,#ff6d5a,#ff4d8d)'}
                    >
                        {props.isExecuting ? '⏹ Stop Flow' : '▶ Execute Flow'}
                    </PrimaryBtn>

                    <PrimaryBtn onClick={props.onSaveFlow} disabled={busy} color="#50fa7b">
                        <span style={{ color: '#0f0f1a' }}>Save to backend</span>
                    </PrimaryBtn>

                    <div className="border-t pt-3 space-y-2" style={{ borderColor: '#1e1e30' }}>
                        <Label>Saved Workflows ({flowsList.length})</Label>
                        {flowsList.length === 0 ? (
                            <p className="text-xs text-center py-4" style={{ color: '#3a3a5c' }}>No saved workflows</p>
                        ) : (
                            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                {flowsList.map((flow) => {
                                    const isActive = flow.id === activeFlowId
                                    return (
                                        <div
                                            key={flow.id}
                                            className="flex items-center justify-between px-3 py-2 rounded-lg transition-all border cursor-pointer hover:border-[#ff6d5a55]"
                                            style={{
                                                background: isActive ? '#ff6d5a11' : '#0f0f1a',
                                                borderColor: isActive ? '#ff6d5a' : '#2d2d4a'
                                            }}
                                            onClick={() => onSelectFlow(flow.id)}
                                        >
                                            <div className="flex-1 min-w-0 pr-2">
                                                <div className="text-xs font-semibold truncate" style={{ color: isActive ? '#ffffff' : '#e0e0ff' }}>
                                                    {flow.name}
                                                </div>
                                                <div className="text-[10px] mt-0.5" style={{ color: '#9999cc' }}>
                                                    {flow.nodes_count} nodes · {flow.edges_count} edges
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (confirm(`Are you sure you want to delete "${flow.name}"?`)) {
                                                        onDeleteFlow(flow.id)
                                                    }
                                                }}
                                                className="p-1 rounded text-[#5555aa] hover:text-[#ff5555] hover:bg-[#ff555511] transition-all"
                                                title={`Delete ${flow.name}`}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"/>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                                </svg>
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ── EXECUTION HISTORY ── */}
            {activePanel === 'executions' && (
                <Section title={`Execution History (${executions.length})`}>
                    {executions.length === 0 ? (
                        <div className="py-8 text-center">
                            <div className="text-2xl mb-2">🕐</div>
                            <p className="text-xs" style={{ color: '#3a3a5c' }}>No executions yet. Click Execute to run your flow.</p>
                            <PrimaryBtn 
                                onClick={props.onExecuteFlow} 
                                disabled={busy && !props.isExecuting} 
                                color={props.isExecuting ? 'linear-gradient(135deg,#ff5555,#ff3333)' : 'linear-gradient(135deg,#ff6d5a,#ff4d8d)'}
                            >
                                {props.isExecuting ? '⏹ Stop Flow Now' : '▶ Execute Flow Now'}
                            </PrimaryBtn>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {executions.map((exec, i) => (
                                <ExecutionCard
                                    key={exec.execution_id}
                                    exec={exec}
                                    isLatest={i === 0 && exec.execution_id === lastExecution?.execution_id}
                                />
                            ))}
                        </div>
                    )}
                </Section>
            )}

            {/* ── LOGS ── */}
            {activePanel === 'logs' && (
                <Section title={`Email Logs (${emailLogs.length})`}>
                    {emailLogs.length === 0 ? (
                        <div className="py-8 text-center">
                            <div className="text-2xl mb-2">📭</div>
                            <p className="text-xs" style={{ color: '#3a3a5c' }}>No email logs yet. Send an email event to see entries here.</p>
                        </div>
                    ) : emailLogs.map((log, i) => (
                        <div key={i} className="rounded-lg overflow-hidden border" style={{ borderColor: '#2d2d4a' }}>
                            <div className="px-3 py-2 flex items-center justify-between"
                                style={{ background: '#1e1e30', borderBottom: '1px solid #2d2d4a' }}>
                                <span className="text-xs font-medium" style={{ color: '#9999cc' }}>Log #{i + 1}</span>
                                <span className="text-xs" style={{ color: '#5555aa' }} title={log.timestamp}>{log.timestamp ? formatRelativeTime(log.timestamp) : ''}</span>
                            </div>
                            <div className="p-3 space-y-2 text-xs" style={{ background: '#0f0f1a', color: '#e0e0ff' }}>
                                <div className="flex justify-between gap-2 border-b pb-1.5" style={{ borderColor: '#1e1e30' }}>
                                    <span style={{ color: '#5555aa' }}>From:</span>
                                    <span className="font-medium truncate max-w-[180px]">
                                        {log.from_addr || log.from || log.data?.from_addr || log.data?.from || '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-2 border-b pb-1.5" style={{ borderColor: '#1e1e30' }}>
                                    <span style={{ color: '#5555aa' }}>Subject:</span>
                                    <span className="font-medium truncate max-w-[180px] text-[#ff6d5a]">
                                        {log.subject || log.data?.subject || '—'}
                                    </span>
                                </div>
                                {(log.body || log.data?.body || log.data?.message) && (
                                    <div className="pt-1">
                                        <span className="block mb-1" style={{ color: '#5555aa' }}>Message:</span>
                                        <p className="p-2 rounded bg-[#13131f] text-[11px] leading-relaxed break-words border" style={{ borderColor: '#1e1e30', color: '#9999cc' }}>
                                            {log.body || log.data?.body || log.data?.message}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </Section>
            )}
            </>
            )}
            </div>
        </aside>

    )
}
