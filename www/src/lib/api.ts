import axios from 'axios'

const fallbackBaseUrl = 'http://localhost:8000'
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || fallbackBaseUrl

export const api = axios.create({
    baseURL: apiBaseUrl,
    headers: { 'Content-Type': 'application/json' },
})

// ── Types ─────────────────────────────────────────────────────────────────

export type PluginType = 'trigger' | 'action'

export type PluginItem = {
    name:             string
    class:            string
    display_name:     string
    description:      string
    icon:             string
    category:         string
    type:             PluginType
    version:          string
    has_credentials:  boolean
}

export type FieldSchema = {
    name:            string
    display_name:    string
    type:            'string' | 'text' | 'number' | 'boolean' | 'select' | 'credential' | 'password'
    required:        boolean
    default?:        unknown
    placeholder?:    string
    description?:    string
    options?:        string[]
    credential_type?: string
    menu_id?:        string
}

export type MenuSchema = {
    id:              string
    title:           string
    icon?:           string
}

export type ConfigElement =
    | {
          element_type: 'field'
          name:            string
          display_name:    string
          type:            'string' | 'text' | 'number' | 'boolean' | 'select' | 'credential' | 'password'
          required:        boolean
          default?:        unknown
          placeholder?:    string
          description?:    string
          options?:        string[]
          credential_type?: string
          menu_id?:        string
      }
    | {
          element_type: 'button'
          id:              string
          type:            'save' | 'test' | 'clear' | 'oauth_google' | 'download' | 'custom'
          display_name:    string
          icon?:           string
          action?:         string
          style?:          'primary' | 'ghost' | 'danger'
          description?:    string
          menu_id?:        string
      }
    | {
          element_type: 'divider'
          menu_id?:     string
      }
    | {
          element_type: 'heading'
          text:         string
          level?:       'h2' | 'h3' | 'h4'
          menu_id?:     string
      }
    | {
          element_type: 'info'
          text:         string
          style?:       'info' | 'warning' | 'success' | 'error'
          icon?:        string
          menu_id?:     string
      }
    | {
          element_type: 'log_viewer'
          filename?:    string
          height?:      string
          menu_id?:     string
      }

export type PluginSchema = {
    name:          string
    describe:      PluginItem
    input_schema:  FieldSchema[]
    output_schema: Record<string, string>
    config_schema: FieldSchema[]
    config_menus?: MenuSchema[]
    config_elements?: ConfigElement[]
}

export type StatusResponse = {
    status:          string
    plugins_loaded:  number
    plugins:         Array<{ name: string; type: PluginType }>
    event_listeners: Record<string, number>
}

export type SchedulerStatusResponse = {
    scheduler_running: boolean
    active_flows: Array<{ flow_id: string; has_trigger_state: boolean; last_signature: string | null }>
    trigger_states: Record<string, string>
}

export type FlowPayload = {
    nodes: unknown[]
    edges: unknown[]
}

export type NodeResult = {
    node_id:     string
    plugin_name: string
    status:      'pending' | 'running' | 'success' | 'error'
    output:      Record<string, unknown>
    error:       string | null
    started_at:  string | null
    finished_at: string | null
}

export type ExecutionResult = {
    execution_id: string
    flow_id:      string
    status:       'running' | 'success' | 'error'
    started_at:   string
    finished_at:  string | null
    node_results: NodeResult[]
    error:        string | null
}

// ── Status ────────────────────────────────────────────────────────────────

export async function getStatus(): Promise<StatusResponse> {
    const { data } = await api.get<StatusResponse>('/status')
    return data
}

export async function getSchedulerStatus(): Promise<SchedulerStatusResponse> {
    const { data } = await api.get<SchedulerStatusResponse>('/status/scheduler')
    return data
}

// ── Plugins ───────────────────────────────────────────────────────────────

export async function getPlugins(): Promise<{ plugins: PluginItem[]; count: number }> {
    const { data } = await api.get('/plugins')
    return data
}

export async function getPluginSchema(name: string): Promise<PluginSchema> {
    const { data } = await api.get(`/plugins/${name}/schema`)
    return data
}

export type BulkPluginSchemas = Record<string, {
    publisher: Record<string, string>
    subscriber: Record<string, string>
}>

let cachedSchemas: BulkPluginSchemas | null = null

export async function getAllPluginSchemas(): Promise<BulkPluginSchemas> {
    if (cachedSchemas) return cachedSchemas
    const { data } = await api.get<BulkPluginSchemas>('/flows/schemas')
    cachedSchemas = data
    return data
}


export async function executePlugin(name: string, inputData: Record<string, unknown>, config: Record<string, unknown>) {
    const { data } = await api.post(`/plugins/${name}/execute`, { input_data: inputData, config })
    return data
}

export async function testPluginConnection(name: string, config: Record<string, unknown>) {
    const { data } = await api.post(`/plugins/${name}/test-connection`, config)
    return data as { ok: boolean; error?: string }
}

export async function getPluginCredentials(name: string) {
    const { data } = await api.get(`/plugins/${name}/credentials`)
    return data as { plugin: string; credentials: Record<string, string>; configured: boolean }
}

export async function savePluginCredentials(name: string, creds: Record<string, string>) {
    const { data } = await api.put(`/plugins/${name}/credentials`, creds)
    return data
}

export async function deletePluginCredentials(name: string) {
    const { data } = await api.delete(`/plugins/${name}/credentials`)
    return data
}

export async function installPluginFromPath(source_path: string, force = false) {
    const { data } = await api.post('/plugins/install', { source_path, force })
    return data
}

export async function installPluginZip(file: File, force = false) {
    const form = new FormData()
    form.append('file', file)
    form.append('force', String(force))
    const { data } = await axios.post(`${apiBaseUrl}/plugins/install-zip`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
}

// ── Flows ─────────────────────────────────────────────────────────────────

export async function getFlows(): Promise<{ flows: Array<{ id: string; name: string; nodes_count: number; edges_count: number; updated_at: number }> }> {
    const { data } = await api.get('/flows')
    return data
}

export async function deleteFlow(id: string) {
    const { data } = await api.delete(`/flows/${id}`)
    return data
}

export async function saveFlow(payload: FlowPayload & { id?: string; name: string }) {
    const { data } = await api.post('/flows/save', payload)
    return data as { status: string; message: string; id: string; flow: any }
}

export async function loadFlow(id?: string) {
    const { data } = await api.get('/flows/load' + (id ? `?id=${id}` : ''))
    return data
}

export async function executeFlow(flow?: FlowPayload, flowId = 'default'): Promise<ExecutionResult> {
    const { data } = await api.post('/flows/execute', { flow, flow_id: flowId })
    return data as ExecutionResult
}

export type StreamEvent =
    | { type: 'node_status'; node_id: string; status: 'pending' | 'running' | 'success' | 'error'; plugin: string; error?: string; output?: Record<string, unknown>; started_at?: string; finished_at?: string }
    | { type: 'execution_done'; status: string; execution_id: string; finished_at: string; error?: string | null }
    | { type: 'execution_error'; error: string }

/**
 * Execute a flow via SSE stream and yield events in real-time.
 * Uses fetch+ReadableStream (not EventSource) so we can POST a body.
 */
export async function* executeFlowStream(
    flow?: FlowPayload,
    flowId = 'default',
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    const response = await fetch(`${apiBaseUrl}/flows/execute/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow, flow_id: flowId }),
        signal,
    })

    if (!response.ok || !response.body) {
        throw new Error(`Stream request failed: ${response.status}`)
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE messages are separated by double newlines
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
            const lines = part.split('\n')
            let   eventType = 'message'
            let   eventData = ''
            for (const line of lines) {
                if (line.startsWith('event: '))      eventType = line.slice(7).trim()
                else if (line.startsWith('data: '))  eventData = line.slice(6).trim()
            }
            if (eventType === 'done') return
            if (eventData) {
                try { yield JSON.parse(eventData) as StreamEvent } catch { /* skip bad frames */ }
            }
        }
    }
}

export async function listExecutions(limit = 20): Promise<ExecutionResult[]> {
    const { data } = await api.get(`/flows/executions?limit=${limit}`)
    return data.executions as ExecutionResult[]
}

export async function getExecution(executionId: string): Promise<ExecutionResult> {
    const { data } = await api.get(`/flows/executions/${executionId}`)
    return data as ExecutionResult
}

// ── Email (legacy trigger) ────────────────────────────────────────────────

export async function sendEmail(payload: { from_addr: string; subject: string }) {
    const { data } = await api.post('/email/send', payload)
    return data
}

export async function getEmailLogs() {
    const { data } = await api.get('/email/logs')
    return data
}

// ── Browser Notification Events ───────────────────────────────────────────

export type BrowserNotificationEvent = {
    id:        string
    title:     string
    message:   string
    icon:      string
    level:     'info' | 'success' | 'warning' | 'error'
    timestamp: string
}

export async function getPendingNotifications(): Promise<BrowserNotificationEvent[]> {
    try {
        const { data } = await api.get('/plugins/notification/events')
        return (data.events as BrowserNotificationEvent[]) || []
    } catch {
        return []
    }
}
