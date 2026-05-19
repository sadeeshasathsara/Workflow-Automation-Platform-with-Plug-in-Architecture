import React from 'react'

export default function App() {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
            <div className="p-8 bg-white shadow rounded-lg max-w-2xl w-full">
                <h1 className="text-2xl font-semibold mb-2">Workflow Automation Platform</h1>
                <p className="text-sm text-slate-600 mb-4">React + Tailwind UI starter. Use shadcn/ui components or add your own.</p>
                <div className="space-y-2">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Open Plugins</button>
                    <button className="px-4 py-2 border rounded">Manage Events</button>
                </div>
            </div>
        </div>
    )
}
