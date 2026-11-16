---
"orca-sidenote": patch
---

Use the custom editing context menu to Cut and Copy when eligible, or Select All to select the whole current note. Change All Occurrences remains available above Select All and through Cmd+F2 (Ctrl+F2 on Windows and Linux). Editing and reading context menus now adapt their width to their contents, within viewport bounds, and wrap long labels. Menu Paste stays disabled; hover over or focus its info icon for a tooltip explaining Cmd+V on macOS or Ctrl+V on Windows and Linux. The tooltip appears close, directly above the info icon, or below it when there is insufficient space above. It may overlap other menu items but does not intercept clicks, and the hover explanation disappears immediately when the pointer leaves the icon. Keyboard focus also shows the explanation; blur or Escape hides it. The explanation is also available to screen readers. In reading mode, Copy Markdown copies the whole underlying raw Markdown regardless of text selection.
