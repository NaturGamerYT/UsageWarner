const { app, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createCanvas } = require('canvas');
const { exec } = require('child_process');

function setAutostart(enabled) {
    const autostartKey = `"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"`;
    const appPath = `"${process.execPath}"`;

    if (enabled) {
        exec(`reg add ${autostartKey} /v "UsageWarner" /t REG_SZ /d ${appPath} /f`, (error) => {
            if (error) console.error('Autostart aktivieren fehlgeschlagen:', error);
        });
    } else {
        exec(`reg delete ${autostartKey} /v "UsageWarner" /f`, (error) => {
            if (error) console.error('Autostart entfernen fehlgeschlagen:', error);
        });
    }
}

function isAutostartEnabled(callback) {
    const autostartKey = `"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"`;
    exec(`reg query ${autostartKey} /v "UsageWarner"`, (error, stdout) => {
        callback(!error && stdout.includes('UsageWarner'));
    });
}


app.on('ready', () => {
    showNotification('Usage Warner läuft im Hintergrund.');
});

app.setAppUserModelId('Usage Warner');

let trayMain = null;
let trayCpu = null;
let trayRam = null;

const settingsPath = path.join(__dirname, 'settings.json');

let settings = {
    ramWarningLevel: 50,
    cpuWarningLevel: 50,
};

let lastCpuInfo = os.cpus();

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        const parsed = JSON.parse(data);
        if (typeof parsed.ramWarningLevel === 'number') settings.ramWarningLevel = parsed.ramWarningLevel;
        if (typeof parsed.cpuWarningLevel === 'number') settings.cpuWarningLevel = parsed.cpuWarningLevel;
        }
    } catch (err) {
        console.error('Fehler beim Laden der settings.json:', err);
    }
}

function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (err) {
        console.error('Fehler beim Speichern der settings.json:', err);
    }
}

function createMainMenu() {
    const ramSubmenu = [];
    for (let i = 10; i <= 100; i += 10) {
        ramSubmenu.push({
            label: `${i}%`,
            type: 'radio',
            checked: settings.ramWarningLevel === i,
            click: () => {
                settings.ramWarningLevel = i;
                saveSettings();
                showNotification(`RAM Warnung gesetzt auf ${i}%`);
                updateMainMenu();
            },
        });
    }

    const cpuSubmenu = [];
    for (let i = 10; i <= 100; i += 10) {
        cpuSubmenu.push({
            label: `${i}%`,
            type: 'radio',
            checked: settings.cpuWarningLevel === i,
            click: () => {
                settings.cpuWarningLevel = i;
                saveSettings();
                showNotification(`CPU Warnung gesetzt auf ${i}%`);
                updateMainMenu();
            },
        });
    }

    isAutostartEnabled((enabled) => {
        settings.autostart = enabled;

        const contextMenu = Menu.buildFromTemplate([
            { label: 'RAM Warnung ab', submenu: ramSubmenu },
            { label: 'CPU Warnung ab', submenu: cpuSubmenu },
            {
                label: 'Autostart',
                type: 'checkbox',
                checked: enabled,
                click: (menuItem) => {
                    settings.autostart = menuItem.checked;
                    setAutostart(menuItem.checked);
                    saveSettings();
                },
            },
            { type: 'separator' },
            { label: 'Beenden', click: () => app.quit() },
        ]);

        trayMain.setContextMenu(contextMenu);
    });
}

function updateMainMenu() {
    createMainMenu();
}

function showNotification(message) {
    new Notification({
        title: 'Usage Warner',
        body: message,
    }).show();
}

function getCpuUsagePercent() {
    const cpus = os.cpus();
    let idleDiff = 0;
    let totalDiff = 0;

    for (let i = 0; i < cpus.length; i++) {
        const prev = lastCpuInfo[i].times;
        const curr = cpus[i].times;

        const prevIdle = prev.idle;
        const currIdle = curr.idle;

        const prevTotal = Object.values(prev).reduce((a, b) => a + b, 0);
        const currTotal = Object.values(curr).reduce((a, b) => a + b, 0);

        idleDiff += currIdle - prevIdle;
        totalDiff += currTotal - prevTotal;
    };

    lastCpuInfo = cpus;

    if (totalDiff === 0) return 0;

    const usage = (1 - idleDiff / totalDiff) * 100;
    return Math.round(usage);
}

function getRamUsagePercent() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return Math.round((usedMem / totalMem) * 100);
}

function createTextIcon(text, color = 'white') {
    const size = 24;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.font = 'bold 16px Sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    const pngBuffer = canvas.toBuffer('image/png');
    return nativeImage.createFromBuffer(pngBuffer);
}

function getColorByUsage(usage) {
    if (usage >= 80) return 'red';
    if (usage >= 60) return 'yellow';
    return '#7CFC00';
}

function createTextIcon(text, color = 'white') {
    const size = 24;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.font = 'bold 18px Sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    const pngBuffer = canvas.toBuffer('image/png');
    return nativeImage.createFromBuffer(pngBuffer);
}

let cpuWarned = false;
let ramWarned = false;

function updateUsageIcons() {
  const cpuUsage = getCpuUsagePercent();
  const ramUsage = getRamUsagePercent();

  const cpuColor = getColorByUsage(cpuUsage);
  const ramColor = getColorByUsage(ramUsage);

  const cpuIcon = createTextIcon(`${cpuUsage}`, cpuColor);
  const ramIcon = createTextIcon(`${ramUsage}`, ramColor);

  trayCpu.setImage(cpuIcon);
  trayRam.setImage(ramIcon);

  trayCpu.setToolTip(`CPU Auslastung: ${cpuUsage}%`);
  trayRam.setToolTip(`RAM Auslastung: ${ramUsage}%`);

  // CPU Warnlogik
  if (cpuUsage >= settings.cpuWarningLevel && !cpuWarned) {
    showNotification(`CPU-Warnung: ${cpuUsage}% Auslastung`);
    cpuWarned = true;
  } else if (cpuUsage < settings.cpuWarningLevel) {
    cpuWarned = false;
  }

  // RAM Warnlogik
  if (ramUsage >= settings.ramWarningLevel && !ramWarned) {
    showNotification(`RAM-Warnung: ${ramUsage}% Auslastung`);
    ramWarned = true;
  } else if (ramUsage < settings.ramWarningLevel) {
    ramWarned = false;
  }
}

app.whenReady().then(() => {
  loadSettings();

  const iconPath = path.join(__dirname, 'icon.ico');
  trayMain = new Tray(iconPath);
  trayMain.setToolTip('Usage Warner');

  trayCpu = new Tray(createTextIcon('CPU'));
  trayCpu.setToolTip('CPU Auslastung');

  trayRam = new Tray(createTextIcon('RAM'));
  trayRam.setToolTip('RAM Auslastung');

  createMainMenu();

  trayMain.on('click', () => trayMain.popUpContextMenu());
  trayMain.on('double-click', () => trayMain.popUpContextMenu());

  updateUsageIcons();
  setInterval(updateUsageIcons, 1000);
});

app.on('window-all-closed', (e) => e.preventDefault());
