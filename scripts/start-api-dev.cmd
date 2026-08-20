@echo off
cd /d C:\Users\TTA\Documents\Codex\2026-07-02\at
if not exist logs mkdir logs
C:\Users\TTA\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd --filter @company-portal/api dev > logs\api-dev.log 2>&1
