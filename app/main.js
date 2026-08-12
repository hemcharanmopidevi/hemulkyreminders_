const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');

let tray = null;
let popoverWindow = null;
let overlayWindow = null;

let reminders = [];
let activeTimers = {};

function createTrayIcon() {
    const svgString = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="9" r="7.5" fill="#000000"/>
        <ellipse cx="9" cy="8" rx="4.2" ry="3.8" fill="#FFFFFF"/>
        <path d="M5.5 11.5 Q9 14.5 12.5 11.5" stroke="#FFFFFF" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <circle cx="7.2" cy="7.5" r="0.7" fill="#000000"/>
        <circle cx="10.8" cy="7.5" r="0.7" fill="#000000"/>
    </svg>`;

    const base64Svg = Buffer.from(svgString).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;

    const icon = nativeImage.createFromDataURL(dataUrl);
    icon.setTemplateImage(true);
    return icon;
}

function createTray() {
    try {
        const icon = createTrayIcon();
        tray = new Tray(icon);
        tray.setToolTip('Hemulky Reminder - Click to open');

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
        const { width: screenWidth } = primaryDisplay.workAreaSize;

        let x = Math.round(bounds.x + (bounds.width / 2) - (popoverBounds.width / 2));
        let y = Math.round(bounds.y + bounds.height + 4);

        if (x + popoverBounds.width > screenWidth) {
            x = screenWidth - popoverBounds.width - 10;
        }
        if (x < 10) x = 10;

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
    createTray();
    createPopoverWindow();
    createOverlayWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createPopoverWindow();
        }
    });
});

app.on('window-all-closed', (e) => {
    e.preventDefault();
});
