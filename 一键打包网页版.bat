@echo off
chcp 65001 >nul
setlocal
rem 一键打包网页版：把 H5 游戏打成可部署/可上传网盘的 zip（放到本脚本同目录）
set SRC=E:\项目\gengling
set OUT=%~dp0gengling-web.zip
echo [1/1] 打包网页版 -^> %OUT%
powershell -NoProfile -Command "Compress-Archive -Path '%SRC%\index.html','%SRC%\manifest.webmanifest','%SRC%\sw.js','%SRC%\css','%SRC%\js','%SRC%\assets' -DestinationPath '%OUT%' -Force"
if exist "%OUT%" (echo 完成: %OUT%) else (echo 打包失败)
pause
endlocal
