; Instalator Mikropłatności dla innych osób (Inno Setup 6).
; Budowanie: powershell -NoProfile -ExecutionPolicy Bypass -File pc\instalacja\instaluj.ps1 -Instalator
; (najpierw testy i budowanie aplikacji; instaluj.ps1 podaje Wersja, Dist i Wyjscie).
; Instalacja bez uprawnień administratora, do tego samego folderu co instaluj.ps1. Odinstalowanie
; w „Aplikacje zainstalowane” usuwa program, ale NIE dane (%APPDATA%\Mikroplatnosci) - te usuwa
; przycisk „Usuń z komputera” w aplikacji.

#ifndef Wersja
  #error Uruchom przez instaluj.ps1 -Instalator (brak numeru wersji)
#endif

[Setup]
AppId={{6C1D7F2A-4E8B-4F3A-9B57-2D8E1A0C5F91}
AppName=Mikropłatności
AppVersion={#Wersja}
AppVerName=Mikropłatności {#Wersja}
AppPublisher=Szymon Bakonis
AppContact=szymon.bakonis@gmail.com
DefaultDirName={localappdata}\Programs\Mikroplatnosci
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#Wyjscie}
OutputBaseFilename=Mikroplatnosci-instalator-{#Wersja}
SetupIconFile=ikona.ico
UninstallDisplayIcon={app}\ikona.ico
UninstallDisplayName=Mikropłatności
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "polski"; MessagesFile: "compiler:Languages\Polish.isl"

[Tasks]
Name: "pulpit"; Description: "Skrót na pulpicie"

[Files]
Source: "{#Dist}\mikroplatnosci-win_x64.exe"; DestDir: "{app}"; DestName: "Mikroplatnosci.exe"; Flags: ignoreversion
Source: "{#Dist}\resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "ikona.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE-Neutralinojs.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\Mikropłatności"; Filename: "{app}\Mikroplatnosci.exe"; WorkingDir: "{app}"; IconFilename: "{app}\ikona.ico"; Comment: "Pilnowanie subskrypcji i drobnych płatności"
Name: "{userdesktop}\Mikropłatności"; Filename: "{app}\Mikroplatnosci.exe"; WorkingDir: "{app}"; IconFilename: "{app}\ikona.ico"; Tasks: pulpit

[Run]
Filename: "{app}\Mikroplatnosci.exe"; WorkingDir: "{app}"; Description: "Uruchom Mikropłatności"; Flags: nowait postinstall skipifsilent

; Powiadomienia przy zamkniętej aplikacji (Ustawienia, harmonogram.js) - zadanie znika razem z programem.
[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Mikroplatnosci - powiadomienia"""; Flags: runhidden; RunOnceId: "UsunZadanie"
