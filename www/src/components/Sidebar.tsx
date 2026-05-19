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

export const NAV_ITEMS: NavItem[] = [
    { id: 'overview', icon: <OverviewIcon />, label: 'Overview' },
    { id: 'flows',    icon: <WorkflowIcon />, label: 'Flows'    },
    { id: 'plugins',  icon: <PluginIcon />,   label: 'Plugins'  },
    { id: 'email',    icon: <EmailIcon />,     label: 'Email'    },
    { id: 'logs',     icon: <LogIcon />,       label: 'Logs'     },
]

interface SidebarProps {
    active: string
    onSelect: (id: string) => void
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
    return (
        <aside
            style={{ background: '#13131f', borderRight: '1px solid #1e1e30' }}
            className="flex flex-col items-center py-4 w-[60px] shrink-0 z-20 h-full"
        >
            {/* Logo */}
            <div className="mb-6 flex items-center justify-center w-9 h-9 rounded-lg"
                style={{ background: 'linear-gradient(135deg,#ff6d5a,#ff4d8d)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
            </div>

            {/* Nav */}
            <nav className="flex flex-col items-center gap-1 flex-1">
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        title={item.label}
                        onClick={() => onSelect(item.id)}
                        className={clsx(
                            'group relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150',
                            active === item.id
                                ? 'text-white'
                                : 'text-[#5555aa] hover:text-[#9999cc] hover:bg-[#1e1e30]'
                        )}
                        style={active === item.id ? { background: '#ff6d5a22', color: '#ff6d5a' } : {}}
                    >
                        {item.icon}
                        {/* Tooltip */}
                        <span className="pointer-events-none absolute left-[52px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity z-50"
                            style={{ background: '#1e1e30', color: '#e0e0ff', border: '1px solid #2d2d4a' }}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </nav>

            {/* Settings at bottom */}
            <button title="Settings"
                className="flex items-center justify-center w-10 h-10 rounded-lg text-[#5555aa] hover:text-[#9999cc] hover:bg-[#1e1e30] transition-all duration-150">
                <SettingsIcon />
            </button>
        </aside>
    )
}
