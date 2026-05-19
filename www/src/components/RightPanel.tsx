import React from 'react'
import { StatusResponse, PluginItem } from '../lib/api'

interface RightPanelProps {
    activePanel: string
    status: StatusResponse | null
    plugins: PluginItem[]
    emailLogs: any[]
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
    selectedPlugin: string
    onInstallPath: () => void
    onInstallZip: (f: File) => void
    onSendEmail: () => void
    onSaveFlow: () => void
    onLoadFlow: () => void
    busy: boolean
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="animate-slide-in">
        <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: '#1e1e30' }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#5555aa' }}>{title}</span>
        </div>
        <div className="p-4 space-y-3">{children}</div>
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

export default function RightPanel(props: RightPanelProps) {
    const { activePanel, status, plugins, emailLogs, busy } = props

    return (
        <aside className="h-full overflow-y-auto shrink-0 w-[300px]"
            style={{ background: '#13131f', borderLeft: '1px solid #1e1e30' }}>

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
                </Section>
            )}

            {/* ── PLUGINS ── */}
            {activePanel === 'plugins' && (
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
                            className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:text-white file:cursor-pointer"
                            style={{ color: '#9999cc' }}
                        />
                    </div>

                    <div className="border-t pt-3 space-y-2" style={{ borderColor: '#1e1e30' }}>
                        <Label>Installed plugins ({plugins.length})</Label>
                        {plugins.length === 0 ? (
                            <p className="text-xs py-4 text-center" style={{ color: '#3a3a5c' }}>No plugins installed</p>
                        ) : plugins.map((p) => (
                            <div key={p.name} className="flex items-center justify-between px-3 py-2 rounded-lg"
                                style={{ background: '#0f0f1a', border: '1px solid #2d2d4a' }}>
                                <span className="text-xs font-medium" style={{ color: '#e0e0ff' }}>{p.name}</span>
                                <span className="text-xs" style={{ color: '#5555aa' }}>{p.class}</span>
                            </div>
                        ))}
                    </div>
                </Section>
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
                        Triggers <code className="text-[#ff6d5a]">POST /email/send</code> and routes through the automation bus. The logger/file-logger plugins must be active to capture this event.
                    </div>
                </Section>
            )}

            {/* ── FLOWS ── */}
            {activePanel === 'flows' && (
                <Section title="Flow Manager">
                    <div>
                        <Label>Flow name</Label>
                        <Input value={props.flowName} onChange={props.setFlowName} placeholder="My Automation Flow" />
                    </div>
                    <PrimaryBtn onClick={props.onSaveFlow} disabled={busy} color="#50fa7b">
                        <span style={{ color: '#0f0f1a' }}>Save to backend</span>
                    </PrimaryBtn>
                    <GhostBtn onClick={props.onLoadFlow} disabled={busy}>Load from backend</GhostBtn>
                    <div className="rounded-lg p-3 text-xs" style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', color: '#5555aa' }}>
                        Uses <code className="text-[#ff6d5a]">POST /flows/save</code> and <code className="text-[#ff6d5a]">GET /flows/load</code>. Also synced to localStorage.
                    </div>
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
                        <div key={i} className="rounded-lg overflow-hidden" style={{ border: '1px solid #2d2d4a' }}>
                            <div className="px-3 py-2 flex items-center justify-between"
                                style={{ background: '#1e1e30', borderBottom: '1px solid #2d2d4a' }}>
                                <span className="text-xs font-medium" style={{ color: '#9999cc' }}>Log #{i + 1}</span>
                                <span className="text-xs" style={{ color: '#5555aa' }}>{log.timestamp ?? ''}</span>
                            </div>
                            <pre className="px-3 py-2 text-xs overflow-auto whitespace-pre-wrap"
                                style={{ background: '#0f0f1a', color: '#e0e0ff', maxHeight: '160px' }}>
                                {JSON.stringify(log, null, 2)}
                            </pre>
                        </div>
                    ))}
                </Section>
            )}
        </aside>
    )
}
