import React from 'react'
import FlowEditor from './components/FlowEditor'

export default function App() {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <header className="p-4 bg-white border-b">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <h1 className="text-lg font-semibold">Workflow Automation Platform</h1>
                    <div className="text-sm text-slate-600">Visual Flow Editor</div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto p-4">
                <FlowEditor />
            </main>
        </div>
    )
}
