# **Technischer Entwicklungsplan: LPC-IDE-Master (UNItopia Edition)**

Dieser Plan erweitert die VS Code Umgebung um spezifische Unterstützung für die **UNIlib** (UNItopia) sowie ein modulares System zur Verwaltung verschiedener LPC-Dialekte und Mudlibs.

## **1\. Dialekt-Management & UNItopia Integration**

LPC-Entwicklung unterscheidet sich stark zwischen den Mudlibs. UNItopia nutzt den **LDMud-Driver** (aktuell Version 3.5.0/3.6.x) und die darauf aufbauende **UNIlib**.

### **Konfigurations-Schema (lpc-config.json)**

Um die Erweiterung flexibel zu halten, wird eine zentrale Konfigurationsdatei eingeführt, die den Dialekt und die Mudlib-Spezifikationen definiert.1

JSON

{  
  "dialect": "ldmud",  
  "version": "3.5.0",  
  "mudlib": {  
    "name": "UNIlib",  
    "baseDir": "/sys/unitopia",  
    "simulEfunFile": "/sys/simul\_efun.c",  
    "includeDirs": \["/sys/include", "/std/include"\],  
    "efunDefinitions": "unitopia\_v3.json"  
  }  
}

### **UNItopia-Spezifika**

* **Efuns & Sfuns:** UNItopia verfügt über einen umfangreichen Satz an simulierten Efuns (sfuns), die wie globale Treiberfunktionen agieren. Der Language Server (LSP) muss diese aus der simul\_efun.c parsen oder über vorkompilierte JSON-Definitionen laden.  
* **Datentypen:** Unterstützung für LDMud-spezifische Typen wie struct, closure (\#') und symbol (').  
* **Property-System:** Die UNIlib nutzt oft spezifische Vererbungsmuster (z.B. /std/room.c), bei denen Funktionen wie create() oder init() zentrale Einstiegspunkte sind.

## **2\. Dynamische Efun-Konfiguration**

Da sich Efuns zwischen Driver-Versionen und MUDs (z.B. UNItopia vs. MorgenGrauen) unterscheiden, wird ein **Efun-Provider-System** implementiert.

* **Vordefinierte Profile:** Das Plugin liefert Standard-Sets für LDMud (UNIlib/MG) und FluffOS mit.1  
* **Runtime-Umschaltung:** Über die VS Code Statusbar oder die Command Palette kann der aktive Dialekt gewechselt werden, woraufhin der LSP den Index der verfügbaren Symbole neu aufbaut.  
* **Auto-Discovery:** Der Server versucht, beim Öffnen eines Workspaces anhand von Dateien wie master.c oder spezifischen Header-Dateien (lpctypes.h) den Dialekt automatisch zu erkennen.

## **3\. Remote-FTP Abgleich & Navigationsbaum**

Die Fernwartung erfolgt über ein virtuelles Dateisystem, das die Mudlib-Struktur direkt im Editor abbildet.2

### **Remote Explorer (Navigationsbaum)**

In der Activity Bar wird ein "Remote MUD" View Container registriert.3

* **TreeDataProvider:** Nutzt die FTP-Verbindung, um Verzeichnisse erst beim Aufklappen ("Lazy Loading") zu laden.5  
* **Kontextmenü:** Aktionen wie "Update Object" oder "Destruct", die über eine integrierte Telnet-Schnittstelle oder ein spezielles Mud-Kommando ausgelöst werden.

### **FileSystemProvider (FTP-Sync)**

Das Plugin implementiert die vscode.FileSystemProvider API für das Schema lpc-ftp://.7

* **Echtzeit-Synchronisation:** Bei aktiviertem uploadOnSave wird jede Änderung via STOR-Kommando unmittelbar auf den UNItopia-Server übertragen.7  
* **Credentials:** Passwörter werden niemals in der Konfiguration, sondern ausschließlich über die SecretStorage API im OS-Schlüsselbund gespeichert.9

## **4\. Programmatische Features (LSP)**

Der Language Server wird für die UNIlib optimiert:

* **Inheritance-Tracking:** Auflösung der inherit-Pfade basierend auf den in der lpc-config.json definierten baseDir und includeDirs.  
* **Documentation Hovers:** Anzeigen von Hilfe-Texten aus dem UNItopia-Magierhandbuch direkt bei Mouseover über Efuns.  
* **Fehlerdiagnose:** Markierung von Syntaxfehlern basierend auf dem gewählten Dialekt (z.B. Warnung bei Verwendung von class in LDMud, da dort struct bevorzugt wird).10

## **5\. Mathematisches Modell der Sichtbarkeit (Erweitert)**

In der UNIlib wird die Funktionssichtbarkeit ![][image1] durch die Tiefe der Vererbungshierarchie bestimmt. Sei ![][image2] die Menge aller (auch indirekt) geerbten Objekte:

![][image3]  
Hierbei ist ![][image4] die Menge der simulierten Efuns (sfuns) und ![][image5] die Menge der harten Efuns des LDMud-Drivers.

## **6\. Phasenplan**

1. **Phase 1:** Implementierung der lpc-config.json und der Profil-Umschaltung für UNItopia.  
2. **Phase 2:** Entwicklung des FileSystemProvider für FTP/SFTP inkl. SecretStorage Integration.9  
3. **Phase 3:** Aufbau des Remote Explorer Trees in der Sidebar.4  
4. **Phase 4:** Feinabstimmung des LSP auf UNItopia-Header und simul\_efuns.

#### **Referenzen**

1. GitHub \- jlchmura/lpc-language-server, Zugriff am Mai 3, 2026, [https://github.com/jlchmura/lpc-language-server](https://github.com/jlchmura/lpc-language-server)  
2. Virtual Workspaces | Visual Studio Code Extension API, Zugriff am Mai 3, 2026, [https://code.visualstudio.com/api/extension-guides/virtual-workspaces](https://code.visualstudio.com/api/extension-guides/virtual-workspaces)  
3. Views | Visual Studio Code Extension API, Zugriff am Mai 3, 2026, [https://code.visualstudio.com/api/ux-guidelines/views](https://code.visualstudio.com/api/ux-guidelines/views)  
4. Tree View API \- Visual Studio Code, Zugriff am Mai 3, 2026, [https://code.visualstudio.com/api/extension-guides/tree-view](https://code.visualstudio.com/api/extension-guides/tree-view)  
5. Language Server Extension Guide \- Visual Studio Code, Zugriff am Mai 3, 2026, [https://code.visualstudio.com/api/language-extensions/language-server-extension-guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)  
6. Language Server Protocol \- Wikipedia, Zugriff am Mai 3, 2026, [https://en.wikipedia.org/wiki/Language\_Server\_Protocol](https://en.wikipedia.org/wiki/Language_Server_Protocol)  
7. liximomo/vscode-sftp: Super fast sftp/ftp extension for VS Code \- GitHub, Zugriff am Mai 3, 2026, [https://github.com/liximomo/vscode-sftp](https://github.com/liximomo/vscode-sftp)  
8. VSCode FTP Simple Extension / How to edit remote files in Visual Studio Code \- YouTube, Zugriff am Mai 3, 2026, [https://www.youtube.com/watch?v=3jB2vdZb-\_s](https://www.youtube.com/watch?v=3jB2vdZb-_s)  
9. VS Code API | Visual Studio Code Extension API, Zugriff am Mai 3, 2026, [https://code.visualstudio.com/api/references/vscode-api\#SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)  
10. LPC | MUD Wiki | Fandom, Zugriff am Mai 3, 2026, [https://mud.fandom.com/wiki/LPC](https://mud.fandom.com/wiki/LPC)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAYCAYAAACFms+HAAAC2klEQVR4Xu2WS6iNURTH//KIkAGRR7lkgpG8BpgIUUhIikwMGChlQNfITQZmEgOlkDySkoFHUk6RMDEhIkWJkWRAIY///6677vnO+vY+37n3npS6//rVaa99vr2+9dofMKj/X8PJuLjYD7XrOS1JB50ii6IhaAiZQtaRDaSjZ60oOX6MbAzrvZpA7pM/BX6QFYU9I8ilsGd/wS4NIyfJ7rBe1FCyhbwi58hWspM8JQ9hL1DUeHITFYHQ28shPTAlHXqRHIRFI2olqSGfXq1fJk9QdlC2u+QFmRZsq8kdMias92o++UquwqIXtZicJ6OiAbZ2m+yJhh7JsVuwSE8PNpcy/BvlZ+i/yoayk9RM8hEWtfh2cuwsmRfWXXrp12R2NMBqV7X6C5aVnPz8G2RksB1BPqCYRN6Qd2RysG0nXSg3kGsXrE/GRgO1jHyHZSSVLVezwK2B+RXLqFvaXCOf0Bi5DnKNTCysRakvUr2hCHlTbwu2qKXkJ9KOK6PvycKw3i0donR8Q32DInyUrPdNCfkLK51RU8lblIORkrKmF7yAcmZVAYq4BkhSp2F/9g1K8wmkp4jLHT8Q1iVv+OewsZuTalq1rbNTTeiOZ7Omw/XnfbBuVppnNewoqxXHayinvyjf9wzpknTH5VdSuqXkuNKuTUpflZo5rvJQmdSQd1zZPAObOrmSrCwVn6W6CDSzc4cV5b2hMotS1h7BpoWmRkqbYE2pmzjWtkv//QCbLkl5yoQunFZ1HOn5KymKimYnGh3T7x3kC9kLu5lz0rDQqM42uKfkMPJvn5KcU32mGlDPWUs+k+uof588Jg/InPrWrNSUNTSpANXbEjI6Gio0g7yEzeKc9OwFZDNZBfuAakV+FxwK622RoqosaXT2JVOtSFNNfVI13fotXcf3yNxoGIAUhC40b9y2SN/NV5D/tO2rdAFqYrXreU21HDYlBip9Lug++SdOD6pKfwGL24iIVA3ycgAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAYCAYAAAC8/X7cAAACuklEQVR4Xu2WS6iNURTHlzxKSKLklUcmIpJQwsBrZoKJUMqAKQaSyTEwMJEkJCUmJkpKFNItA2IiJeURJhRhwkjh/7v7bHffdfb+znfOPVK6v/p1793ru/vbj/Wtvc2G+X8ZKSfJET7QIb3qpyNGy2Nyiw9kmCw3yW1ygYUBpzDwg3J/8/dKtssv8lfiN7kveWazPJT8nYMXnrDyC2lfKx/JW3JH09vypVw+8Gg/LMhludW1Z6Hzi/Kn3JC0r5JnLHSyWx6xMGHPQvlYzvWBJgzmuHxj+YGel1/lUhdbJB/IWa69BfKNAbyVM5J2JrZY9skncr3lt/t009zqM8CzFnZ5hYtFSKPP1trHKHlFNpK2LMvkd3nVwj9F5slrFrbypLwjVyZxYMIvbPDOpZCK7Gyakp64gM/kFBcjzYjxTBEeIvcPuHY6m2MD38A0OTN9wMLAX2faYb58L5/LqS6WEifwzsI7UpY0233q/SHm/w+52sUibDHfQw4m1ifHu3ZoWFgYqlMV7PQHy0+Av2kvVrc4e1axapVKXLLW1AMm1GethSEHcZ67Lye4WOynWAVL+V8XJoCeuHJ8nOxgFacs7FTDtUOcQHEXS/lfl3YTyKVFCiWSc+CThXLsiRO44Nr7qZP/7ShNgAJAVamaAO8/bGEBOQhzVKZQqf53Alt7V45z7bGGVy0O5wIHGAcZ50WOOMZshgw1/2Gv5es3cLIyQHbZD3Cd/Gjh+jHWxVIozxSYQYVgl4X6nN5/6GxP+lBNWARyuPShUr9fWbgDxfsPd6GnFiZBGlXB7rFA3WZIWybKhxYGVoLrBxPk9smhON3aDzzSsJCK3WZILXbKm1adCt3AtfueXOMDvYZKcUNu9IEhwsKcs9bv568wW15v/uwF3KP4VnrVXy3I86NyjA90CNcJynPugjjMP+c3gFeIYsjG6WgAAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA+CAYAAACWTEfwAAAJ30lEQVR4Xu3dCahtVR3H8RUNmDaQRSVZls0WPCVTioxIjXpRRIOVFVESjSYojVg+mmiey9DCBkoaaECSJnoXRGmQIkisTBtooMQmKiqlWl/WXt51/3fv477nnnvevvd+P7A45/zPcM/Z5zz27/33XnunJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEnbybF5HByLO8hlsSBJkrTdXBwLO8y5sSBJkrSd3JDHMbG4A/00j8NjUZIkaepOzmNPLO5Qb8jj+liUJEmaugtjYQc7Mo//xKIkSdLUXRsLO9xz8nhLLEqSJE3V6XnsjcVd4H+xIEmSNFXMDD00FncBA5skSdoW6K7t1uDyozyOikVJkqSpIazt1sB2Rh6fjUVJkqSpIaxdE4u7xPF5/CkWJUmSpobA9s5Y3EX4/E+IRUmSpCkhsDw2FncRPv+nY1GSJGkq7p9KYLlfvGOEU9L4g8/+LRYmhM/P5ANJkqRJOjWPX8XiSK9K4ycrjH3cgbCbJ11IknTA3TIWBtw+jX/som3k794mFhbgZXnsj8WRphTY+A77jFm+BjZJkhbktDz+nsqK9Yt5HNLV/9XVftLdxjGpP4RckMeVeTw1j+vyeHlz37PTuJX7RtwprYYBxglr7063yONFoXa7PN6Rx9nd4H3eurn/y831RXhvHl+JxZGWEdiuTmuXYR3fah7zoeY67prHWd11vtePNPf1+Uua//0NeWAen8zjvDxWUlnOm/G4tH4Z1CFJ0uRcH26zMj451Ngf6S6hRrC7WXP7oDy+mtY+7rLm+qK8OfWvVAlhXwu1Y1NZwcfg+Ofm+sPyuFdzu/pAHg+JxewTeRwWi42LUgkW81hGYAPPfWKovb+7ZDnSJWwdkcfDm9vPSMMdOPw6zX5/LNs+fP4+F+bxweb24akEuNbQrNShv4Xv53G3UPtouC1J0iTEFSudCzpVFaGsrsyrB6USTCLC1EnN7Z831xeFUPj7WEwlXF0Vaj/O486hhvYz3yGPZzW3q3kD26V5nB+LIy0jsNFJZfkd2d2ma4kzu0s+cwxDEc99RCw2+B5mvb+hEDUU2Hi/r21us/zj5ux5AhsTN+pv/eju8n3dpSRJk9KuWF/dXK9YgbfBhY7Uv1MJOi1WfF9Ia1echJu2C7cI/00lGEb8LUZF16wv2CGGiUvyuG2ozRvY/pDmPwbbMgIbmwLpVvEZnpvWf4/tMgSH5/hlKpvQY33I5Wn2+xsKUUOB7TupvN5vU/lO+n5T8wS2G1JZDnQQ+35TkiRNBl0GuhVsNuQo9RErwjagsELvWxnTWSNMtZvKWAHHQLAZbHZtu0O4eXe5ktau8LkeO4Oge/SbUIuviXkDG8tmXyyOtIzAtpJWP2vbtWI58jtYaWqEcD7rP1MJ6i02Jw7Zn2a/v6EQNRTYqqel8rpXxDvSxgMb3y3/wQBhnWXCMmiDO8fSq4+JTowFSZK2EoegYL+zp6fhzsWYwMa+P7HOCrjdp22zWKmyc3ydIIF6gNqVtD6w9QUAanGHdULrnlDbqYGNcFqX31u7S7qR7LsWAxsIbXS44j5rTF4YssjAFjdps58iv9loo4GNzeB1MzC/Uf4zwL55L7nxEcULw22wTOJ+npIkbSn2CWNyQNwJvWJfpTbMsFKLK2NW5j9LZdNSi81Mbbiq6E4ws7RvHN88LuL12vf5lLS6aY5OSLvDOB2h2B1hAkI74aAifMRg+YJUZkRGH0tl5T7kr2nagS0+7z55fKO7Xjdrt5iAQFfyUaHeziqNvpfW/53WBXncMdT4z0K7/2NV31vFa/cFu9en9f/h4G98KtRA15cOYfzOCXe8Bp02Zk6/PZXHfCaV3z2TSZgx++FUOtL8jpkQQdCtkyL25vHxVCZGsD/cGak8X5KkTWHlx0p7CCuj2GU4NJXgQ8CiW/WKtXffiJXrItBlYT8zQsAf0+osRDZt0h0CQY5JBi0O50HI433yHA7xERFS+gIAeDwdHZ7PCpvO0U3hPeyLxZG2MrCx/DiLAs9jWdRlyPf44OZxLMc6EQFnpXLokyc3NQLPUMAHh4SZ9f4IRY/O422pLFu6WuesecQqAtGVqXyP300lMPWhQ8jvkNfiNXlt9teLIY5QyHurvx+WQ10uvAZ+2F2ySZ3fB79/Qiaf+76pfHbq98jj4u6xj0nltTmszItTCWx0fwmcsTspSdKGHRELPei6sIJq0XlgxciM0SGsaJeF4EZQiFiR8j6HumI8L+6f1SKw8nw2ucWVfx+6le+JxZH4G7OCTmvs4zaK5RFngLIMWiyvGpT7/CKNe3/3TmXZHhfvaNCh5bfGsrnn2rt68Vq8Jq89L7q27Mv29e42Ya3OJObfQe2Yscn8m931l6YSuOm8Vdx2MoMkaWnosrw7Fm8CXbsxYXCR6GrMCpB9aodkUT6X1h8Pbiw6Mewv1na8+rBstzIM74+FBn971uZQcHDiMYFtqvgPCptH+ZxsDuY3UrtknCv223k8IJXfN9/12d39DDpshDe60CzHWcFWkqSFo9MRZ1IOYf+vOhlg2djUNhbdtzFds40g2LKZbV6s9Ak7baem9ZpU7o874y8a+171GfO9cjDm7RzYJEnSDrcvlcNgbAYTODi9FR3DFrcJQteG+tTwHg1skiRpsthURljZ7KawZ6YywaKGHwa3647xU2ZgkyRJk0dYeWgszoHNtexAz+EluKwHCZ46Pv8PYlGSJGlKCCyErN2Kz8/x2yRJkiaLwMIxvnajo1L5/AfHOyRJkqZkN+/D9bzUfzw8SZKkSeGk6rMCG0fCn4WDsXKWCE5tFPdbe35aPW9mPWPAaakc86se0qQ9K8GyXZrH42NRkiRpajgaPofeuFW8I+BYa5yXknOcchqlisBVTw/FvnCPTKvHi6tH3AcH2a3n5Kznx8Qb0+xTR22lWUFVkiRpUj6fxymhRuh6Uh5HpxLW6MT14RyWNaBxTsxXphL+CIJ19und09rwRsC7ortO+OMcrweCgU2SJG0bhKt/hBpnJ+CE4ZyrkzMGfCmV7hrjnOZxVzfXW4d1A5ynkq5axazMeroqznHJCduXbW86MH9XkiRpblfFQirdM4IN4e3McF/Fycf7cBL2Pd11Qlk95yjdunO7SxAIz++uLwun1PpdLEqSJE0d5/08LtTelcfp3XXCF5s2K040TtC6PA3v/3ZSd8km00vyOCGPi9LayQlsKh0Kg1uFk567OVSSJG1LhJgTY3ET2DetDXl93pTKJtllui6tdv8kSZK2Fc4pek0sbtIhsdA4KBaW4HWxIEmStN2cGgs7DN01SZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSVqC/wOlD6/T50ammQAAAABJRU5ErkJggg==>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAYCAYAAAAh8HdUAAABE0lEQVR4Xu3SIUtDYRTG8TNUcCgTFJsWsQxsCrJmEpNFwYFrC4LBNBFlVUQwyAzLaxaTXcSoyWARBAd+AcPi1P+zs+G9h9tMAx/4wTjnfe/Ozp3Z0GYSa1jHVL82g9nBgWTGUMcbDrCPJ1zgAcXfo55RNHGNiURd3/CIe/MJUimhjaXYICdoxKJyig/MxQY5xGYsKi184xgjobeI6VDrpWx+Sbq4QxWF5KEYbe7M/MLgsjxb9sipaDSt9hyf5hf3UifMD2nmXGyQDXzhKDYWcGX+nmKW0cFubGiVtxiPDVLBK+ZjQ+9HT1sNdY2sJWyFeu9vcYMaXvqfteZLvGPHMn5r3vyJila+gm3zf3jWuP/5U34AsNUreE1r6AoAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADUAAAAYCAYAAABa1LWYAAACqUlEQVR4Xu2WSaiOURzGHxkyhmtKpihFXUMkFKVIKGUoKVZyzVJKJIsrWbAzFSFTKImFMpcFC2UhGzuFZMFO2RjieXrO8Z7v3PeWcr98X71P/Xq/93+G77znP5wDVKpUqZ5aSn79JbvDmKbRJfKdzMvs3cgM8o6sytoaWoPJC/KWjKpt+qNzZFFubGRNI1/ITdIj2PScTnqG92OhX9NoHZwzexObPCbv9AvvCr1BRXPjS4v/QVaQkWQcOUMOp52aSTGffpIP5D35FN6bKodSzSRfUZtPA8gNMiG8dw+2XEvIZ9SO7UxTyVq4mtZdMZ/SM2gEOUF6h3ctZlvRXKPjZHNuLNFWsik31kPatQsoP5+i+pMrZHzeAHvvATof+18U8+kN7J0yrYe9FsNGobia3CJHyXN4rD76GuzVDeQyHL6qngfJWTIQnmchuQ6HpDbtJIrjQvMvIxcDo8kw+EjZBVdh/c9cd++osnyK0mL2wTkTJ9CZdZrsgBen6qixsu8ki8lrMpu8gj9wJXze3YPnmQxfzfbDR4jGKlqWh9+nyB54/lmkDd7Y+fDc+o/bpB2ZVNU+orjTpZVPfEva7pM+HoYF5CUKryqflIvakIlwbmmB2m1FgZ6yzyGPgm04GUvuoghbLVQfoHWp8m6Bc1BHjTylOVSUHsKelcfjpeCfpZ29Cu9ink8xP1V4crUHohQh8SOl7WQoPL+8ULZgtdXl3NTE8dbRCueTQkphpkU9RcerlOzPYG9p8fK6Qi1uzhiyJvSVp3WxjpJHJsFV+A4ctl2uKXAOKTxUPB7DxUJ5oo9RSGkhqYbA/Q7BeSHpxqKw3kgOoBij53l4fm3AEdICh/sTlFfgLlF6ECtMeiX2vuF3LvWLd8iomHf5Yax3bUQ8I6MtH1+pUqPoNzcZfPku0idgAAAAAElFTkSuQmCC>