/**
 * File: auth.js
 * Description: VNC-based authentication page for adding new Google AI Studio accounts
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

(() => {
    const { createApp, nextTick } = Vue;

    const app = createApp({
        beforeUnmount() {
            window.removeEventListener('unload', this.cleanupSession);
        },
        data() {
            return {
                hasInitialized: false,
                isConnected: false,
                isSaving: false,
                rfb: null,
                showIntroDialog: false,
                showReload: false,
                showTextDialog: false,
                skipIntro: false,
                statusDetail: '',
                statusTitle: '',
                statusTone: 'info',
                textInput: '',
            };
        },
        methods: {
            cleanupSession() {
                if (navigator.sendBeacon) {
                    fetch('/api/vnc/sessions', {
                        keepalive: true,
                        method: 'DELETE',
                    }).catch(() => {});
                }
            },
            clearStatus() {
                this.statusTitle = '';
                this.statusDetail = '';
                this.statusTone = 'info';
                this.showReload = false;
            },
            closeTextDialog() {
                this.showTextDialog = false;
            },
            ensureConnected() {
                if (!this.rfb || !this.isConnected) {
                    ElementPlus.ElMessage.warning('VNC session is not connected yet.');
                    return false;
                }
                return true;
            },
            escapeHtml(value) {
                return String(value).replace(/[&<>"']/g, char => ({
                    '"': '&quot;',
                    '&': '&amp;',
                    "'": '&#x27;',
                    '<': '&lt;',
                    '>': '&gt;',
                }[char]));
            },
            goBack() {
                if (window.history.length > 1) {
                    window.history.back();
                    return;
                }
                window.location.href = '/';
            },
            handleIntroCancel() {
                this.showIntroDialog = false;
                this.goBack();
            },
            handleIntroConfirm() {
                if (this.skipIntro) {
                    localStorage.setItem('vncIntroSkip', '1');
                }
                this.showIntroDialog = false;
                this.startVncIfNeeded();
            },
            initializeVnc() {
                const vncContainer = document.getElementById('vnc-container');
                const vncSurface = document.getElementById('vnc-surface');

                if (!vncContainer || !vncSurface) {
                    this.setStatus({
                        detail: 'Please refresh the page and try again.',
                        reload: true,
                        title: 'VNC container is missing.',
                        tone: 'error',
                    });
                    return;
                }

                this.loadVncClient(vncContainer, vncSurface);
            },
            isIntroDismissed() {
                return localStorage.getItem('vncIntroSkip') === '1';
            },
            async loadVncClient(vncContainer, vncSurface) {
                this.setStatus({ title: 'Loading VNC client library...' });

                let RFB;
                try {
                    const module = await import('https://esm.sh/@novnc/novnc@1.4.0/lib/rfb.js');
                    RFB = module.default;
                } catch (error) {
                    console.error('Failed to load noVNC library:', error);
                    const safeMessage = this.escapeHtml(error.message || error);
                    this.setStatus({
                        detail: `${safeMessage}<div class="vnc-status-note">Please check your internet connection.</div>`,
                        reload: true,
                        title: 'Failed to load VNC client library.',
                        tone: 'error',
                    });
                    return;
                }

                this.setStatus({ title: 'Requesting VNC session...' });

                try {
                    const initialWidth = vncContainer.clientWidth;
                    const initialHeight = vncContainer.clientHeight;
                    console.log(`[VNC] Sending initial dimensions to backend: ${initialWidth}x${initialHeight}`);

                    const response = await fetch('/api/vnc/sessions', {
                        body: JSON.stringify({ height: initialHeight, width: initialWidth }),
                        headers: { 'Content-Type': 'application/json' },
                        method: 'POST',
                    });

                    let data = {};
                    try {
                        data = await response.json();
                    } catch (err) {
                        data = {};
                    }

                    if (!response.ok) {
                        throw new Error(data.error || `Server responded with ${response.status}`);
                    }
                    if (data.error) {
                        throw new Error(data.error);
                    }

                    vncSurface.innerHTML = '';

                    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
                    const wsUrl = `${protocol}://${window.location.host}/vnc`;

                    console.log(`[VNC] Connecting to ${wsUrl}...`);

                    const rfbOptions = { shared: true };
                    if (data.password) {
                        rfbOptions.credentials = { password: data.password };
                    }

                    this.rfb = new RFB(vncSurface, wsUrl, rfbOptions);

                    this.rfb.addEventListener('connect', () => {
                        console.log('[VNC] Successfully connected.');
                        this.isConnected = true;
                        this.clearStatus();
                    });

                    this.rfb.addEventListener('disconnect', e => {
                        console.log('[VNC] Disconnected.');
                        this.isConnected = false;
                        const detail = e && e.detail ? e.detail : {};
                        const reason = detail.clean
                            ? 'Session closed normally.'
                            : (detail.reason || 'Connection dropped unexpectedly.');
                        this.setStatus({
                            detail: `Reason: ${this.escapeHtml(reason)}`,
                            reload: true,
                            title: 'VNC session has been closed.',
                            tone: 'neutral',
                        });
                    });

                    this.rfb.addEventListener('securityfailure', e => {
                        console.error('[VNC] Security failure:', e);
                        this.isConnected = false;
                        this.setStatus({
                            detail: 'The password was rejected by the server.',
                            reload: true,
                            title: 'VNC authentication failed.',
                            tone: 'error',
                        });
                    });

                    this.rfb.scaleViewport = true;
                    this.rfb.resizeSession = false;
                } catch (error) {
                    console.error('Error starting VNC session:', error);
                    const safeMessage = this.escapeHtml(error.message || error);
                    this.setStatus({
                        detail: `${safeMessage}<div class="vnc-status-note">This feature requires Linux with <code>Xvfb</code>, <code>x11vnc</code>, and <code>websockify</code> installed.</div>`,
                        reload: true,
                        title: 'Failed to start VNC session',
                        tone: 'error',
                    });
                }
            },
            openTextDialog() {
                if (!this.ensureConnected()) {
                    return;
                }
                this.textInput = '';
                this.showTextDialog = true;
                nextTick(() => {
                    if (this.$refs.textInputRef) {
                        this.$refs.textInputRef.focus();
                    }
                });
            },
            reloadPage() {
                window.location.reload();
            },
            async saveAuth(accountName = null) {
                if (this.isSaving) {
                    return;
                }
                if (!this.ensureConnected()) {
                    return;
                }

                this.isSaving = true;

                try {
                    const body = accountName ? JSON.stringify({ accountName }) : null;
                    const headers = accountName ? { 'Content-Type': 'application/json' } : {};

                    const response = await fetch('/api/vnc/auth', {
                        body,
                        headers,
                        method: 'POST',
                    });

                    const data = await response.json();

                    if (data.message === 'vncAuthSaveSuccess') {
                        ElementPlus.ElMessage.success(`Account "${data.accountName}" saved successfully!`);
                        sessionStorage.setItem('newAuthInfo', JSON.stringify(data));
                        window.location.href = '/';
                        return;
                    }

                    if (data.message === 'errorVncEmailFetchFailed') {
                        this.isSaving = false;
                        try {
                            const result = await ElementPlus.ElMessageBox.prompt(
                                'Could not automatically detect email. Please enter a name for this account:',
                                'Account Name',
                                {
                                    cancelButtonText: 'Cancel',
                                    confirmButtonText: 'Save',
                                    inputValue: '',
                                }
                            );
                            if (result && result.value) {
                                await this.saveAuth(result.value);
                            } else {
                                ElementPlus.ElMessage.info('Save cancelled.');
                            }
                        } catch (err) {
                            if (err !== 'cancel' && err !== 'close') {
                                console.error(err);
                            }
                        }
                        return;
                    }

                    ElementPlus.ElMessage.error(`Failed to save authentication: ${data.error || 'Unknown error.'}`);
                } catch (error) {
                    console.error('Error saving auth file:', error);
                    ElementPlus.ElMessage.error(`An error occurred while saving the auth file: ${error.message || error}.`);
                } finally {
                    this.isSaving = false;
                }
            },
            sendBackspace() {
                if (!this.ensureConnected()) {
                    return;
                }
                this.rfb.sendKey(0xFF08, 'Backspace', true);
                this.rfb.sendKey(0xFF08, 'Backspace', false);
            },
            sendText() {
                if (!this.ensureConnected()) {
                    return;
                }
                const text = this.textInput;
                if (!text) {
                    return;
                }
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    const code = char.charCodeAt(0);
                    this.rfb.sendKey(code, char, true);
                    this.rfb.sendKey(code, char, false);
                }
                this.textInput = '';
                this.showTextDialog = false;
            },
            setStatus({ title, detail = '', tone = 'info', reload = false }) {
                this.statusTitle = title;
                this.statusDetail = detail;
                this.statusTone = tone;
                this.showReload = reload;
            },
            startVncIfNeeded() {
                if (this.hasInitialized) {
                    return;
                }
                this.hasInitialized = true;
                this.initializeVnc();
            },
        },
        mounted() {
            if (this.isIntroDismissed()) {
                this.startVncIfNeeded();
            } else {
                this.showIntroDialog = true;
            }
            window.addEventListener('unload', this.cleanupSession);
        },
    });

    app.use(ElementPlus)
        .mount('#app');
})();
