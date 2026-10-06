' Запуск Server Manager без окна консоли.
' Если рядом лежит портативный node.exe — используем его,
' иначе системный node из PATH.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
If fso.FileExists(root & "\manager\node.exe") Then
    sh.Run """" & root & "\manager\node.exe"" manager\launcher.mjs", 0, False
Else
    sh.Run "cmd /c node manager\launcher.mjs", 0, False
End If
