# up.ps1 - Smart Docker Compose Startup Script
# Automatically detects and frees conflicting host ports (6379, 8000, 5173) before starting.

$ports = @(6379, 8000, 5173)
$currentProjectContainers = @(
    "workflowautomationplatformwithplug-inarchitecture-redis-1",
    "workflowautomationplatformwithplug-inarchitecture-api-1",
    "workflowautomationplatformwithplug-inarchitecture-worker-1",
    "workflowautomationplatformwithplug-inarchitecture-web-1"
)

Write-Host "Checking for port conflicts on host..." -ForegroundColor Cyan

foreach ($port in $ports) {
    # 1. Check and stop conflicting Docker containers
    $conflictingContainers = docker ps --format "{{.ID}}::{{.Names}}::{{.Ports}}" | Where-Object { $_ -match ":$port->" }
    foreach ($line in $conflictingContainers) {
        if ($line) {
            $parts = $line -split "::"
            $id = $parts[0]
            $name = $parts[1]
            
            # Skip if it is one of our own project containers
            if ($currentProjectContainers -contains $name) {
                continue
            }
            
            Write-Host "Port $port is occupied by external Docker container '$name' ($id). Stopping container..." -ForegroundColor Yellow
            docker stop $id | Out-Null
            Write-Host "Successfully stopped container '$name'." -ForegroundColor Green
        }
    }

    # 2. Check and stop conflicting native host processes (e.g. standalone uvicorn / python workers)
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        $owningPid = $conn.OwningProcess
        if ($owningPid) {
            $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
            if ($proc) {
                # Avoid terminating system, docker daemon, or current powershell processes
                if ($proc.ProcessName -notmatch "docker|wsl|com.docker|svchost|system" -and $proc.Id -ne $PID) {
                    Write-Host "Port $port is occupied by local host process '$($proc.ProcessName)' (PID $owningPid). Terminating process..." -ForegroundColor Yellow
                    Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
                    Write-Host "Successfully terminated host process '$($proc.ProcessName)'." -ForegroundColor Green
                }
            }
        }
    }
}

# 3. Launch Docker Compose
Write-Host "`nLaunching workflow automation platform..." -ForegroundColor Cyan
docker compose up -d
