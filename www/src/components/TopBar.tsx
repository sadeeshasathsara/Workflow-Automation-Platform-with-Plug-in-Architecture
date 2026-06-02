import React from 'react'

interface TopBarProps {
    busy: boolean
    message: string
    flowName: string
    onFlowNameChange: (v: string) => void
    onSave: () => void
    onLoad: () => void
    onRefresh: () => void
    onRun: () => void
    onStop: () => void
    isExecuting: boolean
    schedulerRunning?: boolean
    flowActive: boolean
    onToggleActive: () => void
}

const SaveIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
)
const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={spinning ? 'animate-spin-slow' : ''}>
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
)
const PlayIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
)
const StopIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
)
const LoadIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
)

const EditIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#9999cc' }}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
)

export default function TopBar({ busy, message, flowName, onFlowNameChange, onSave, onLoad, onRefresh, onRun, onStop, isExecuting, schedulerRunning, flowActive, onToggleActive }: TopBarProps) {
    const [permission, setPermission] = React.useState(() => {
        return typeof Notification !== 'undefined' ? Notification.permission : 'default'
    })

    const handleRequestPermission = () => {
        if (typeof Notification !== 'undefined') {
            Notification.requestPermission().then((perm) => {
                setPermission(perm)
            })
        }
    }

    return (
        <header
            className="flex items-center gap-3 px-4 h-[52px] shrink-0 z-10"
            style={{ background: '#13131f', borderBottom: '1px solid #1e1e30' }}
        >
            {/* Breadcrumb / flow name */}
            <div className="flex items-center gap-2 flex-1 min-w-0 group">
                <span className="text-[#5555aa] text-sm select-none">Workflows</span>
                <span className="text-[#2d2d4a] select-none">/</span>
                <div className="flex items-center gap-1.5 border-b border-dashed border-transparent hover:border-[#3a3a5c] focus-within:border-[#ff6d5a] transition-colors max-w-[260px] px-1 py-0.5">
                    <input
                        value={flowName}
                        onChange={(e) => onFlowNameChange(e.target.value)}
                        className="bg-transparent text-sm font-medium text-[#e0e0ff] outline-none min-w-0 max-w-[220px]"
                        spellCheck={false}
                    />
                    <EditIcon />
                </div>
            </div>

            {/* Notification Permission Request Badge */}
            {permission !== 'granted' && typeof Notification !== 'undefined' && (
                <button
                    onClick={handleRequestPermission}
                    title="Enable system browser push notifications"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all border select-none bg-[#ffb86c12] border-[#ffb86c33] text-[#ffb86c] hover:bg-[#ffb86c22] active:scale-95 animate-pulse"
                >
                    <span>🔔</span> Enable System Notifications
                </button>
            )}



            {/* Status badge */}
            {message && (
                <div key={message} className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium animate-toast"
                    style={{ background: '#1e1e30', color: busy ? '#ffb86c' : '#50fa7b', border: '1px solid #2d2d4a' }}>
                    {busy && <span className="w-2 h-2 rounded-full bg-[#ffb86c] animate-pulse inline-block" />}
                    {!busy && <span className="w-2 h-2 rounded-full bg-[#50fa7b] inline-block" />}
                    {message}
                </div>
            )}

            {/* Divider */}
            <div className="w-px h-6 bg-[#2d2d4a]" />

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button onClick={onRefresh} disabled={busy}
                    title="Refresh all data (R)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9999cc] hover:text-white hover:bg-[#1e1e30] transition-all disabled:opacity-40">
                    <RefreshIcon spinning={busy} />
                    <span className="hidden lg:inline">Refresh</span>
                </button>

                <button onClick={onLoad} disabled={busy}
                    title="Load last flow"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9999cc] hover:text-white hover:bg-[#1e1e30] transition-all disabled:opacity-40">
                    <LoadIcon />
                    <span className="hidden lg:inline">Load</span>
                </button>

                <button onClick={onSave} disabled={busy}
                    title="Save flow (Ctrl+S)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9999cc] hover:text-white hover:bg-[#1e1e30] transition-all disabled:opacity-40">
                    <SaveIcon />
                    <span className="hidden lg:inline">Save</span>
                </button>

                {/* Background Trigger Toggle */}
                <button
                    onClick={onToggleActive}
                    disabled={busy || isExecuting}
                    title={flowActive ? 'Stop background auto-trigger (Ctrl+Enter)' : 'Enable background auto-trigger (Ctrl+Enter)'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 border"
                    style={{
                        background: flowActive ? '#50fa7b12' : 'transparent',
                        borderColor: flowActive ? '#50fa7b44' : '#2d2d4a',
                        color: flowActive ? '#50fa7b' : '#5555aa',
                    }}
                >
                    <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{
                            background: flowActive ? '#50fa7b' : '#3a3a5c',
                            animation: flowActive ? 'pulse 1.6s ease-in-out infinite' : 'none',
                        }}
                    />
                    <span className="hidden lg:inline">{flowActive ? 'Auto On' : 'Auto Off'}</span>
                </button>

                {/* Execute / Stop */}
                {isExecuting ? (
                    <button onClick={onStop}
                        title="Stop the running workflow"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                        style={{ background: 'linear-gradient(135deg,#ff5555,#ff3333)' }}>
                        <StopIcon />
                        <span>Stop</span>
                    </button>
                ) : (
                    <button onClick={onRun} disabled={busy}
                        title="Run the current workflow"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 hover:opacity-90 active:scale-95"
                        style={{ background: 'linear-gradient(135deg,#50fa7b,#3cd060)', color: '#0f0f1a' }}>
                        <PlayIcon />
                        <span>Execute</span>
                    </button>
                )}
            </div>
        </header>
    )
}
