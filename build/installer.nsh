; Preserve the user-created portable vault when the installed application is
; upgraded or uninstalled. All packaged files are removed, but CodeHarbor-Data
; remains in the installation directory so that an uninstall cannot erase it.
!macro customRemoveFiles
  SetOutPath $TEMP
  Push $R0
  Push $R1

  FindFirst $R0 $R1 "$INSTDIR\*.*"

  codeharbor_remove_loop:
    StrCmp $R1 "" codeharbor_remove_done
    StrCmp $R1 "." codeharbor_remove_next
    StrCmp $R1 ".." codeharbor_remove_next
    StrCmp $R1 "CodeHarbor-Data" codeharbor_remove_next

    IfFileExists "$INSTDIR\$R1\*.*" codeharbor_remove_directory codeharbor_remove_file

    codeharbor_remove_directory:
      RMDir /r "$INSTDIR\$R1"
      Goto codeharbor_remove_next

    codeharbor_remove_file:
      Delete "$INSTDIR\$R1"

    codeharbor_remove_next:
      FindNext $R0 $R1
      Goto codeharbor_remove_loop

  codeharbor_remove_done:
    FindClose $R0
    RMDir "$INSTDIR"
    Pop $R1
    Pop $R0
!macroend
