![Logo](admin/linux-control.png)

# ioBroker.linux-control

[![NPM version](https://img.shields.io/npm/v/iobroker.linux-control.svg)](https://www.npmjs.com/package/iobroker.linux-control)
[![Downloads](https://img.shields.io/npm/dm/iobroker.linux-control.svg)](https://www.npmjs.com/package/iobroker.linux-control)
![Anzahl der Installationen (latest)](https://iobroker.live/badges/iobroker.linux-control-installed.svg)
![Anzahl der Installationen (stable)](https://iobroker.live/badges/iobroker.linux-control-stable.svg)
[![Lizenz](https://img.shields.io/github/license/Scrounger/ioBroker.linux-control.svg)](https://github.com/Scrounger/ioBroker.linux-control/blob/master/LICENSE)

## Linux Control Adapter für ioBroker

[English](README.md) | Deutsch

[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=VWAXSTS634G88&source=url)

Steuerung von Linux-Geräten und Abfragen von Systeminformationen.

**Dieser Adapter nutzt Sentry-Bibliotheken, um Ausnahmen und Codefehler automatisch an die Entwickler zu melden.** Weitere Details und Informationen zum Deaktivieren der Fehlerberichterstattung findest du in der [Sentry-Plugin Dokumentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)!

---

## Konfiguration

### Allgemein (General)

![General](docs/en/img/general.png)

| Einstellung | Beschreibung |
| --- | --- |
| aktiviert | Aktiviert oder deaktiviert die Aktualisierung des Hosts |
| Datenpunkt-ID | ID, unter der alle Datenpunkte gespeichert werden |
| IP | IP-Adresse deines Linux-Geräts |
| Port | SSH-Port deines Linux-Geräts |
| Abfrageintervall | Abfrageintervall in Minuten (0 oder leer deaktiviert die automatische Abfrage) |
| Benutzer | SSH-Benutzer für die Anmeldung |
| Passwort / Passphrase | SSH-Passwort oder Passphrase bei Nutzung eines RSA-Schlüssels |
| benutze Sudo | Befehle mit `sudo` ausführen |
| Veraltete SSH-Algorithmen erlauben | Erlaubt ältere SSH-Schlüsselaustausch- & Verschlüsselungsalgorithmen (z. B. `diffie-hellman-group1-sha1`, `3des-cbc`, `ssh-rsa`) für ältere Geräte/Switches |
| RSA-Schlüssel | Pfad und Dateiname deines RSA-Schlüssels (oder Schlüsseltext) |
| Timeout | Verbindungs-Timeout in Sekunden |

---

### Datenpunkte (Datapoints)

![Datapoints](docs/en/img/datapoints.gif)

Der Adapter erstellt vordefinierte Datenpunkte mit Informationen und Steuerungsmöglichkeiten für das Linux-Gerät.

---

## Fehlerbehebung & Bekannte Probleme (Troubleshooting)

- **Host wird als `seems not to be online` angezeigt (ICMP-Ping schlägt fehl):**
  Vor jedem SSH-Verbindungsaufbau führt der Adapter eine ICMP-Ping-Prüfung durch (`ping.promise.probe`). In **Docker-Containern** oder **unprivilegierten LXC-Containern** (z. B. Proxmox) fehlen normalen Benutzern (wie dem `iobroker`-User) häufig die Rechte zum Öffnen von Raw-ICMP-Sockets.
  - **Lösung 1 (Empfohlen):** SUID-Rechte für `ping` auf dem ioBroker-Server setzen:
    ```bash
    sudo chmod u+s $(which ping)
    ```
  - **Lösung 2:** Linux-Capabilities für `ping` setzen:
    ```bash
    sudo setcap cap_net_raw+ep $(which ping)
    ```
  - **Lösung 3 (Docker):** `--cap-add=NET_RAW` beim Docker-Container hinzufügen oder auf dem Docker-Host `sysctl -w net.ipv4.ping_group_range="0 2147483647"` ausführen.
- Prüfe, ob das Paket `iputils-ping` auf dem Ziel-Linux-Gerät installiert ist.

---

## Changelog

### **WORK IN PROGRESS**

- (meistermopper) add optional legacy SSH algorithms support for older devices (closes #90)
- (meistermopper) add Biome linter, `npm run test:local` workflow
- (meistermopper) fix invalid common.states type for `command.host` object
- (meistermopper) update dependencies, adminUI configuration and repochecker compliance

### 1.1.6 (2026-07-23)

- (meistermopper) Improved timer resource cleanup on unload using adapter-core safe timeouts
- (meistermopper) Enforced state ack handling filter in onStateChange
- (meistermopper) Added legacy SSH key exchange and cipher algorithm support
- (meistermopper) Prevented browser password autofill in admin hosts configuration table
- (meistermopper) Fixed broken badges in README and updated links to HTTPS
- (meistermopper) Added ICMP ping troubleshooting guide and created deutsche README (`README_de.md`)
- (meistermopper) Updated dependencies (`node-ssh`, `ping`, `axios`, `mocha`, `chai`, `eslint`, `gulp`)

---

## Lizenz

MIT License

Copyright (c) 2020-2026 Scrounger <scrounger@gmx.net>
