const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, Notification } = require('electron');
const path = require('path');

let tray = null;
let popoverWindow = null;
let overlayWindow = null;

let reminders = [];
let activeTimers = {};

function showReminderNotification(message, options = {}) {
    if (!Notification.isSupported()) {
        console.warn('System notifications are not supported on this device.');
        return;
    }

    const body = (message || 'Reminder!').toString().trim() || 'Reminder!';
    const notification = new Notification({
        title: options.title || 'Hemulky',
        body,
        silent: false,
        urgency: 'critical'
    });

    notification.on('click', () => {
        showPopover();
    });

    notification.show();
}

function createTrayIcon() {
    // Prefer the green Hulk logo PNG so the menu-bar icon is obviously colored (not monochrome).
    const fs = require('fs');
    const iconPath = path.join(__dirname, 'assets', 'trayIcon.png');

    try {
        if (fs.existsSync(iconPath)) {
            const icon = nativeImage.createFromPath(iconPath);
            if (!icon.isEmpty()) {
                // Do NOT setTemplateImage — we want a bright green Hulk, not a gray glyph.
                return icon.resize({ width: 22, height: 22 });
            }
        }
    } catch (err) {
        console.warn('Could not load tray PNG, falling back to SVG:', err.message);
    }

    const svgString = `<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
        <circle cx="22" cy="22" r="21" fill="#2E7D32"/>
        <circle cx="22" cy="22" r="18" fill="#66BB6A"/>
        <ellipse cx="22" cy="20" rx="12" ry="11" fill="#1B5E20"/>
        <circle cx="16" cy="18" r="2.2" fill="#C8E6C9"/>
        <circle cx="28" cy="18" r="2.2" fill="#C8E6C9"/>
        <path d="M14 26 Q22 33 30 26" stroke="#C8E6C9" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </svg>`;

    const base64Svg = Buffer.from(svgString).toString('base64');
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64Svg}`);
}

function createTray() {
    try {
        const icon = createTrayIcon();
        tray = new Tray(icon);
        tray.setToolTip('Hemulky Reminder - Click to open');
        tray.setIgnoreDoubleClickEvents(true);

        const bounds = tray.getBounds();
        console.log('Hemulky Menu Bar Tray created at position:', bounds);

        tray.on('click', (event, bounds) => {
            togglePopover(bounds);
        });

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Open Hemulky Controls', click: () => showPopover() },
            { label: 'Test Smash Now', click: () => triggerDrop({ message: 'Time to drink water! 💧', suit: 'classic' }) },
            { type: 'separator' },
            { label: 'Quit Hemulky', click: () => app.quit() }
        ]);

        tray.on('right-click', () => {
            tray.popUpContextMenu(contextMenu);
        });
    } catch (err) {
        console.error('Error creating tray:', err);
    }
}

function createPopoverWindow() {
    popoverWindow = new BrowserWindow({
        width: 350,
        height: 520,
        show: false,
        frame: false,
        fullscreenable: false,
        resizable: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    popoverWindow.loadFile(path.join(__dirname, 'src/ui/popover.html'));

    popoverWindow.on('blur', () => {
        if (popoverWindow && !popoverWindow.webContents.isDevToolsOpened()) {
            popoverWindow.hide();
        }
    });
}

function togglePopover(bounds) {
    if (!popoverWindow) return;
    if (popoverWindow.isVisible()) {
        popoverWindow.hide();
    } else {
        showPopover(bounds);
    }
}

function showPopover(bounds) {
    if (!bounds && tray) {
        bounds = tray.getBounds();
    }

    if (bounds) {
        const popoverBounds = popoverWindow.getBounds();
        const primaryDisplay = screen.getPrimaryDisplay();
        const { x: workX, y: workY, width: workWidth, height: workHeight } = primaryDisplay.workArea;
        const screenHeight = primaryDisplay.bounds.height;

        let x = Math.round(bounds.x + (bounds.width / 2) - (popoverBounds.width / 2));

        // macOS menu bar is at top → open below icon.
        // Windows taskbar is usually at bottom → open above icon.
        const trayNearBottom = bounds.y > screenHeight / 2;
        let y;
        if (trayNearBottom || process.platform === 'win32') {
            y = Math.round(bounds.y - popoverBounds.height - 8);
        } else {
            y = Math.round(bounds.y + bounds.height + 4);
        }

        // Keep fully inside the usable work area
        if (x + popoverBounds.width > workX + workWidth) {
            x = workX + workWidth - popoverBounds.width - 10;
        }
        if (x < workX + 10) x = workX + 10;
        if (y < workY + 10) y = workY + 10;
        if (y + popoverBounds.height > workY + workHeight) {
            y = workY + workHeight - popoverBounds.height - 10;
        }

        popoverWindow.setPosition(x, y, false);
    }

    if (popoverWindow) {
        popoverWindow.webContents.send('reminders-updated', reminders);
        popoverWindow.show();
        popoverWindow.focus();
    }
}

function createOverlayWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    overlayWindow = new BrowserWindow({
        x: 0,
        y: 0,
        width: width,
        height: height,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.loadFile(path.join(__dirname, 'src/overlay/overlay.html'));

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
}

function triggerDrop(reminderData) {
    if (!overlayWindow) {
        createOverlayWindow();
    }

    const data = typeof reminderData === 'string'
        ? { message: reminderData, id: Date.now().toString(), suit: 'classic' }
        : reminderData;

    showReminderNotification(data.message, { title: 'Hemulky Reminder' });

    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.webContents.send('start-drop', data);
}

ipcMain.on('close-popover', () => {
    if (popoverWindow && popoverWindow.isVisible()) {
        popoverWindow.hide();
    }
});

ipcMain.on('trigger-test-drop', (event, data) => {
    triggerDrop(data || { message: 'Time to drink water! 💧', suit: 'classic' });
});

ipcMain.on('dismiss-overlay', () => {
    if (overlayWindow) {
        setTimeout(() => {
            overlayWindow.hide();
        }, 500);
    }
});

ipcMain.on('complete-reminder', (event, reminderData) => {
    if (reminderData && reminderData.id) {
        const id = reminderData.id.toString();
        const existing = reminders.find(r => r.id.toString() === id);
        if (existing && existing.type === 'time') {
            reminders = reminders.filter(r => r.id.toString() !== id);
            if (activeTimers[id]) {
                clearTimeout(activeTimers[id]);
                clearInterval(activeTimers[id]);
                delete activeTimers[id];
            }
            if (popoverWindow) {
                popoverWindow.webContents.send('reminders-updated', reminders);
            }
        }
    }
});

ipcMain.on('snooze-reminder', (event, reminderData) => {
    if (!reminderData) return;

    const now = new Date(Date.now() + 5 * 60 * 1000);
    const hrs = now.getHours();
    const mins = now.getMinutes();
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const displayHr = (hrs % 12 || 12).toString().padStart(2, '0');
    const displayMin = mins.toString().padStart(2, '0');
    const snoozedTimeStr = `${displayHr}:${displayMin} ${ampm}`;

    const id = (reminderData.id || Date.now()).toString();
    const existing = reminders.find(r => r.id.toString() === id);

    if (existing) {
        existing.type = 'time';
        existing.time = snoozedTimeStr;

        if (activeTimers[id]) {
            clearTimeout(activeTimers[id]);
            clearInterval(activeTimers[id]);
        }

        activeTimers[id] = setTimeout(() => {
            triggerDrop(existing);
        }, 5 * 60 * 1000);
    } else {
        const snoozedObj = {
            id: id,
            message: reminderData.message || 'Snoozed Reminder',
            type: 'time',
            time: snoozedTimeStr,
            suit: reminderData.suit || 'classic',
            active: true,
            createdAt: new Date().toLocaleTimeString()
        };
        reminders.push(snoozedObj);
        activeTimers[id] = setTimeout(() => {
            triggerDrop(snoozedObj);
        }, 5 * 60 * 1000);
    }

    if (popoverWindow) {
        popoverWindow.webContents.send('reminders-updated', reminders);
    }
});

ipcMain.on('schedule-reminder', (event, reminder) => {
    const reminderObj = {
        id: Date.now().toString(),
        message: reminder.message || 'Time for a break!',
        type: reminder.type || 'time',
        time: reminder.time,
        suit: reminder.suit || 'classic',
        repeat: reminder.repeat || false,
        active: true,
        createdAt: new Date().toLocaleTimeString()
    };

    reminders.push(reminderObj);
    scheduleTimer(reminderObj);

    const whenLabel = reminderObj.type === 'interval'
        ? `every ${reminderObj.time}m`
        : `at ${reminderObj.time}`;
    showReminderNotification(`Set: ${reminderObj.message} (${whenLabel})`, {
        title: 'Hemulky — Reminder scheduled'
    });

    if (popoverWindow) {
        popoverWindow.webContents.send('reminders-updated', reminders);
    }
});

ipcMain.on('delete-reminder', (event, id) => {
    reminders = reminders.filter(r => r.id.toString() !== id.toString());
    if (activeTimers[id]) {
        clearTimeout(activeTimers[id]);
        clearInterval(activeTimers[id]);
        delete activeTimers[id];
    }
    if (popoverWindow) {
        popoverWindow.webContents.send('reminders-updated', reminders);
    }
});

ipcMain.on('get-reminders', (event) => {
    event.reply('reminders-updated', reminders);
});

function scheduleTimer(reminder) {
    if (reminder.type === 'interval') {
        const minutes = parseInt(reminder.time) || 30;
        const ms = minutes * 60 * 1000;
        activeTimers[reminder.id] = setInterval(() => {
            triggerDrop(reminder);
        }, ms);
    } else {
        const checkTime = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (timeStr === reminder.time) {
                triggerDrop(reminder);
            }
        };
        activeTimers[reminder.id] = setInterval(checkTime, 30000);
    }
}

app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide();
    }

    createTray();
    createPopoverWindow();
    createOverlayWindow();

    // Open controls once on launch so it's obvious Hemulky started.
    setTimeout(() => {
        showPopover();
        showReminderNotification('Click the green Hulk icon in the menu bar anytime.', {
            title: 'Hemulky is ready'
        });
    }, 600);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createPopoverWindow();
        }
        showPopover();
    });
});

app.on('window-all-closed', (e) => {
    e.preventDefault();
});
