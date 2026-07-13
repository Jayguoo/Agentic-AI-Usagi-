Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

pythonw = fso.BuildPath(root, ".venv\Scripts\pythonw.exe")
app = fso.BuildPath(root, "usagi_app.pyw")

If Not fso.FileExists(pythonw) Then
  shell.Run "cmd /c uv sync", 0, True
End If

shell.Run """" & pythonw & """ """ & app & """", 1, False
