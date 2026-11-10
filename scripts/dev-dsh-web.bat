@echo off
setlocal
cd /d "%~dp0.."
set "DSH=%CD%\packages\deepseek-harness"
set "PATCH_MCP=%CD%\config\dsh\nova-mcp.cordis.yml"
set "PATCH_BRAND=%CD%\config\dsh\nova-brand.cordis.yml"
if not exist "%DSH%\package.json" (
  echo [ERROR] missing packages\deepseek-harness
  exit /b 1
)
pushd "%DSH%"
where pnpm >nul 2>&1 || (echo [ERROR] pnpm required & popd & exit /b 1)
if not exist node_modules (
  echo [INFO] pnpm install...
  call pnpm install
)
echo [INFO] UI: http://127.0.0.1:3080/
call pnpm dsh web --patch "%PATCH_MCP%" --patch "%PATCH_BRAND%"
set RC=%ERRORLEVEL%
popd
exit /b %RC%
