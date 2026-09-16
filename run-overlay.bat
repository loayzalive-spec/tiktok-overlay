@echo off
REM ============================================================
REM  Sirve el overlay en http://127.0.0.1:5500
REM ============================================================
REM
REM  Hace falta un servidor HTTP (no vale abrir index.html con
REM  doble clic): el overlay arranca con fetch('config.json'), y
REM  desde file:// el navegador lo bloquea por CORS, asi que la
REM  pagina se quedaria en blanco.
REM
REM  Sirve la carpeta donde esta este .bat, no una ruta fija, asi
REM  que la carpeta se puede mover o renombrar sin tocar nada.
REM
REM  En OBS: fuente "Navegador" -> URL http://127.0.0.1:5500
REM  (marcar "Actualizar el navegador cuando la escena se active"
REM  para recoger los cambios de config.json al cambiar de escena).
REM
REM  Esta ventana tiene que quedarse ABIERTA. Ctrl+C o cerrarla
REM  apaga el overlay.
REM ============================================================

setlocal
set PUERTO=5500
cd /d "%~dp0"

REM El modo "catalog" ademas pide las reglas a la app de TikTok
REM (config.json -> catalogConfig.apiBase, por defecto el 3000).
REM Este .bat NO la lanza: para eso esta run.bat en d:\tiktok-actions.
echo.
echo  Carpeta : %CD%
echo  URL     : http://127.0.0.1:%PUERTO%
echo.
echo  Pega esa URL en una fuente "Navegador" de OBS.
echo  Deja esta ventana abierta; Ctrl+C la detiene.
echo.

REM python primero y py despues: en algunas instalaciones de
REM Windows solo uno de los dos queda en el PATH.
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    python -m http.server %PUERTO% --bind 127.0.0.1
    goto :fin
)

where py >nul 2>nul
if %ERRORLEVEL%==0 (
    py -m http.server %PUERTO% --bind 127.0.0.1
    goto :fin
)

echo  [ERROR] No encuentro Python en el PATH.
echo.
echo  Alternativa con Node (descarga el servidor la primera vez,
echo  hace falta internet):
echo.
echo      npx --yes http-server -p %PUERTO% -a 127.0.0.1 -c-1
echo.
pause

:fin
endlocal
