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
const LoadIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
)

export default function TopBar({ busy, message, flowName, onFlowNameChange, onSave, onLoad, onRefresh, onRun }: TopBarProps) {
    return (
        <header
            className="flex items-center gap-3 px-4 h-[52px] shrink-0 z-10"
            style={{ background: '#13131f', borderBottom: '1px solid #1e1e30' }}
        >
            {/* Breadcrumb / flow name */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[#5555aa] text-sm">Workflows</span>
                <span className="text-[#2d2d4a]">/</span>
                <input
                    value={flowName}
                    onChange={(e) => onFlowNameChange(e.target.value)}
                    className="bg-transparent text-sm font-medium text-[#e0e0ff] outline-none border-b border-transparent focus:border-[#ff6d5a] transition-colors min-w-0 max-w-[240px]"
                    spellCheck={false}
                />
            </div>

            {/* Status badge */}
            {message && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium animate-toast"
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
                    title="Refresh all data"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9999cc] hover:text-white hover:bg-[#1e1e30] transition-all disabled:opacity-40">
                    <RefreshIcon spinning={busy} />
                    <span className="hidden lg:inline">Refresh</span>
                </button>

                <button onClick={onLoad} disabled={busy}
                    title="Load flow"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9999cc] hover:text-white hover:bg-[#1e1e30] transition-all disabled:opacity-40">
                    <LoadIcon />
                    <span className="hidden lg:inline">Load</span>
                </button>

                <button onClick={onSave} disabled={busy}
                    title="Save flow"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9999cc] hover:text-white hover:bg-[#1e1e30] transition-all disabled:opacity-40">
                    <SaveIcon />
                    <span className="hidden lg:inline">Save</span>
                </button>

                <button onClick={onRun} disabled={busy}
                    title="Execute workflow"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#ff6d5a,#ff4d8d)' }}>
                    <PlayIcon />
                    <span>Execute</span>
                </button>
            </div>
        </header>
    )
}
