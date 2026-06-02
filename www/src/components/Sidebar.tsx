import React from 'react'
import clsx from 'clsx'

type NavItem = { id: string; icon: React.ReactNode; label: string }

const WorkflowIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><line x1="17.5" y1="10" x2="17.5" y2="21"/>
        <line x1="13" y1="17.5" x2="21" y2="17.5"/>
    </svg>
)
const PluginIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>
    </svg>
)
const EmailIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
    </svg>
)
const LogIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
)
const SettingsIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
)
const OverviewIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
)

const HistoryIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
)

export const NAV_ITEMS: NavItem[] = [
    { id: 'overview',    icon: <OverviewIcon />, label: 'Overview'  },
    { id: 'flows',       icon: <WorkflowIcon />, label: 'Flows'     },
    { id: 'plugins',     icon: <PluginIcon />,   label: 'Plugins'   },
    { id: 'email',       icon: <EmailIcon />,    label: 'Email'     },
    { id: 'executions',  icon: <HistoryIcon />,  label: 'History'   },
    { id: 'logs',        icon: <LogIcon />,      label: 'Logs'      },
]


interface SidebarProps {
    active: string
    onSelect: (id: string) => void
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
    const [expanded, setExpanded] = React.useState(() => {
        try {
            return localStorage.getItem('sidebar_expanded') === 'true'
        } catch {
            return false
        }
    })

    const toggleExpanded = () => {
        setExpanded(prev => {
            const next = !prev
            try {
                localStorage.setItem('sidebar_expanded', String(next))
            } catch {}
            return next
        })
    }

    return (
        <aside
            style={{
                background: '#13131f',
                borderRight: '1px solid #1e1e30',
                width: expanded ? '200px' : '60px',
                transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            className="flex flex-col py-4 shrink-0 z-20 h-full overflow-hidden px-2.5"
        >
            {/* Logo area */}
            <div className="mb-6 flex items-center gap-3 px-1.5 h-9 select-none">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                    style={{ background: 'linear-gradient(135deg,#ff6d5a,#ff4d8d)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                </div>
                <span className={clsx(
                    "text-[11px] font-bold tracking-wider transition-all duration-300 whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-[#ff6d5a] to-[#ff4d8d]",
                    expanded ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0 overflow-hidden pointer-events-none"
                )}>
                    FLOW ENGINE
                </span>
            </div>

            {/* Nav */}
            <nav className="flex flex-col gap-1.5 flex-1">
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        title={expanded ? undefined : item.label}
                        onClick={() => onSelect(item.id)}
                        className={clsx(
                            'group relative flex items-center px-2.5 w-full h-10 rounded-lg transition-all duration-150',
                            active === item.id
                                ? 'text-white'
                                : 'text-[#5555aa] hover:text-[#9999cc] hover:bg-[#1e1e30]'
                        )}
                        style={active === item.id ? { background: '#ff6d5a22', color: '#ff6d5a' } : {}}
                    >
                        <div className="shrink-0 flex items-center justify-center">
                            {item.icon}
                        </div>
                        <span className={clsx(
                            "ml-3 text-xs font-semibold whitespace-nowrap transition-all duration-300",
                            expanded ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0 overflow-hidden pointer-events-none"
                        )}>
                            {item.label}
                        </span>
                        
                        {/* Tooltip */}
                        {!expanded && (
                            <span className="pointer-events-none absolute left-[52px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity z-50"
                                style={{ background: '#1e1e30', color: '#e0e0ff', border: '1px solid #2d2d4a' }}>
                                {item.label}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            {/* Bottom Actions */}
            <div className="flex flex-col gap-1.5 mt-auto border-t pt-3" style={{ borderColor: '#1e1e30' }}>
                {/* Toggle Button */}
                <button
                    onClick={toggleExpanded}
                    title={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
                    className="flex items-center px-2.5 w-full h-10 rounded-lg text-[#5555aa] hover:text-[#9999cc] hover:bg-[#1e1e30] transition-all duration-150"
                >
                    <div className="shrink-0 flex items-center justify-center">
                        {expanded ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
                            </svg>
                        )}
                    </div>
                    <span className={clsx(
                        "ml-3 text-xs font-semibold whitespace-nowrap transition-all duration-300",
                        expanded ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0 overflow-hidden pointer-events-none"
                    )}>
                        Collapse
                    </span>
                </button>

                {/* Settings */}
                <button title="Settings"
                    className="flex items-center px-2.5 w-full h-10 rounded-lg text-[#5555aa] hover:text-[#9999cc] hover:bg-[#1e1e30] transition-all duration-150">
                    <div className="shrink-0 flex items-center justify-center">
                        <SettingsIcon />
                    </div>
                    <span className={clsx(
                        "ml-3 text-xs font-semibold whitespace-nowrap transition-all duration-300",
                        expanded ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0 overflow-hidden pointer-events-none"
                    )}>
                        Settings
                    </span>
                </button>
            </div>
        </aside>
    )
}
