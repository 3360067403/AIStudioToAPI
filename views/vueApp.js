/**
 * File: vueApp.js
 * Description: Vue.js application for managing service configuration and real-time status updates
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

/* global I18n */

(() => {
    const { createApp } = Vue;

    const app = createApp({
        computed: {
            accountDetailsHtml() {
                this.lang;
                const initialIndices = this.initialIndicesRaw || [];
                if (initialIndices.length === 0) {
                    return '';
                }

                const invalidIndices = this.invalidIndicesRaw || [];
                const accountNameMap = new Map(Object.entries(this.accountNameMap || {}));

                return initialIndices
                    .map(index => {
                        const isInvalid = invalidIndices.includes(index);
                        const name = isInvalid
                            ? this.t('jsonFormatError')
                            : accountNameMap.get(String(index)) || this.t('unnamedAccount');

                        const escapedName = name.replace(/[&<>"'/]/g, char => ({
                            '"': '&quot;',
                            '&': '&amp;',
                            "'": '&#x27;',
                            '/': '&#x2F;',
                            '<': '&lt;',
                            '>': '&gt;',
                        }[char]));

                        return `<span class="label" style="padding-left: 20px;">${this.t('account')} ${index}</span>: ${escapedName}`;
                    })
                    .join('\n');
            },
            apiKeySourceText() {
                this.lang;
                return this.t(this.apiKeySource.toLowerCase()) || this.apiKeySource;
            },
            browserConnectedClass() {
                return this.browserConnected ? 'status-ok' : 'status-error';
            },
            browserConnectedText() {
                this.lang;
                return this.browserConnected ? this.t('running') : this.t('disconnected');
            },
            currentAccountName() {
                this.lang;
                if (this.currentAuthIndex === null || this.currentAuthIndex < 0) {
                    return this.t('noActiveAccount');
                }
                const account = this.accountDetails.find(acc => acc.index === this.currentAuthIndex);
                return account ? account.name : this.t('noActiveAccount');
            },
            forceThinkingIcon() {
                return this.forceThinkingEnabled ? '✅' : '❌';
            },
            forceThinkingText() {
                this.lang;
                return this.forceThinkingEnabled ? this.t('enabled') : this.t('disabled');
            },
            forceUrlContextIcon() {
                return this.forceUrlContextEnabled ? '✅' : '❌';
            },
            forceUrlContextText() {
                this.lang;
                return this.forceUrlContextEnabled ? this.t('enabled') : this.t('disabled');
            },
            forceWebSearchIcon() {
                return this.forceWebSearchEnabled ? '✅' : '❌';
            },
            forceWebSearchText() {
                this.lang;
                return this.forceWebSearchEnabled ? this.t('enabled') : this.t('disabled');
            },
            formatErrorsText() {
                this.lang;
                const indices = this.invalidIndicesRaw || [];
                return `[${indices.join(', ')}] (${this.t('total')}: ${indices.length})`;
            },
            serviceConnectedClass() {
                return this.serviceConnected ? 'status-ok' : 'status-error';
            },
            serviceConnectedText() {
                this.lang;
                return this.serviceConnected ? this.t('running') : this.t('disconnected');
            },
            streamingModeText() {
                this.lang;
                return this.streamingModeReal ? this.t('real') : this.t('fake');
            },
            totalScannedAccountsText() {
                this.lang;
                const indices = this.initialIndicesRaw || [];
                return `[${indices.join(', ')}] (${this.t('total')}: ${indices.length})`;
            },
        },
        created() {
            this.logs = this.t('loading');
            I18n.onChange(lang => {
                this.lang = lang;
                if (this.logCount === 0) {
                    this.logs = this.t('loading');
                }
            });
        },
        data() {
            return {
                accountDetails: [],
                accountNameMap: {},
                apiKeySource: '',
                browserConnected: false,
                currentAuthIndex: 0,
                failureCount: 0,
                forceThinkingEnabled: false,
                forceUrlContextEnabled: false,
                forceWebSearchEnabled: false,
                initialIndicesRaw: [],
                invalidIndicesRaw: [],
                isInitializing: true,
                isSwitchingAccount: false,
                isUpdating: false,
                lang: I18n.getLang(),
                logCount: 0,
                logs: 'Loading...',
                selectedAccount: null,
                serviceConnected: false,
                streamingModeReal: false,
                usageCount: 0,
            };
        },
        methods: {
            addUser() {
                window.location.href = '/auth';
            },
            deleteUser() {
                const targetIndex = this.selectedAccount;
                if (targetIndex === null) {
                    ElementPlus.ElMessage.warning(this.t('noAccountSelected'));
                    return;
                }

                const targetAccount = this.accountDetails.find(acc => acc.index === targetIndex);
                const accountSuffix = targetAccount ? ` (${targetAccount.name})` : '';

                ElementPlus.ElMessageBox.confirm(
                    `${this.t('confirmDelete')} #${targetIndex}${accountSuffix}?`,
                    {
                        cancelButtonText: this.t('cancel'),
                        confirmButtonText: this.t('ok'),
                        lockScroll: false,
                        type: 'warning',
                    }
                )
                    .then(async () => {
                        this.isSwitchingAccount = true;
                        try {
                            const res = await fetch(`/api/accounts/${targetIndex}`, {
                                method: 'DELETE',
                            });
                            const data = await res.json();
                            const message = this.t(data.code, data);
                            if (res.ok) {
                                ElementPlus.ElMessage.success(message);
                            } else {
                                ElementPlus.ElMessage.error(message);
                            }
                        } catch (err) {
                            ElementPlus.ElMessage.error(
                                this.t('deleteFailed', { message: err.message || err })
                            );
                        } finally {
                            this.isSwitchingAccount = false;
                            window.updateContent?.();
                        }
                    })
                    .catch(e => {
                        if (e !== 'cancel') {
                            console.error(e);
                        }
                    });
            },
            handleForceThinkingBeforeChange() {
                return this.handleSettingChange('/api/settings/force-thinking', 'forceThinking');
            },
            handleForceUrlContextBeforeChange() {
                return this.handleSettingChange('/api/settings/force-url-context', 'forceUrlContext');
            },
            handleForceWebSearchBeforeChange() {
                return this.handleSettingChange('/api/settings/force-web-search', 'forceWebSearch');
            },
            handleLogout() {
                const { ElMessageBox, ElMessage } = ElementPlus;
                ElMessageBox.confirm(this.t('logoutConfirm'), {
                    cancelButtonText: this.t('cancel'),
                    confirmButtonText: this.t('ok'),
                    lockScroll: false,
                    type: 'warning',
                })
                    .then(() => {
                        fetch('/logout', {
                            headers: { 'Content-Type': 'application/json' },
                            method: 'POST',
                        })
                            .then(res => res.json())
                            .then(data => {
                                const message = this.t(data.message);
                                if (data.message === 'logoutSuccess') {
                                    ElMessage.success(message);
                                    setTimeout(() => {
                                        window.location.href = '/login';
                                    }, 500);
                                } else {
                                    ElMessage.error(message);
                                }
                            })
                            .catch(err => {
                                console.error('Logout error:', err);
                                ElMessage.error(this.t('logoutError'));
                            });
                    })
                    .catch(() => {
                        // User canceled, no-op
                    });
            },
            async handleSettingChange(apiUrl, settingName) {
                if (this.isUpdating) {
                    return false;
                }

                try {
                    const res = await fetch(apiUrl, { method: 'PUT' });
                    const data = await res.json();
                    if (res.ok) {
                        const message = this.t(data.message, {
                            setting: this.t(settingName),
                            value: this.t(String(data.value)),
                        });
                        ElementPlus.ElMessage.success(message);
                        window.updateContent?.();
                        return true;
                    } else {
                        const message = this.t(data.message, data);
                        ElementPlus.ElMessage.error(message);
                        return false;
                    }
                } catch (err) {
                    ElementPlus.ElMessage.error(this.t('settingFailed', { message: err.message || err }));
                    return false;
                }
            },
            async handleStreamingModeBeforeChange() {
                if (this.isUpdating) {
                    return false;
                }

                const newMode = !this.streamingModeReal ? 'real' : 'fake';

                try {
                    const res = await fetch('/api/settings/streaming-mode', {
                        body: JSON.stringify({ mode: newMode }),
                        headers: { 'Content-Type': 'application/json' },
                        method: 'PUT',
                    });
                    const data = await res.json();
                    if (res.ok) {
                        const message = this.t(data.message, {
                            setting: this.t('streamingMode'),
                            value: this.t(data.value),
                        });
                        ElementPlus.ElMessage.success(message);
                        window.updateContent?.();
                        return true;
                    } else {
                        const message = this.t(data.message, data);
                        ElementPlus.ElMessage.error(message);
                        return false;
                    }
                } catch (err) {
                    ElementPlus.ElMessage.error(this.t('settingFailed', { message: err.message || err }));
                    return false;
                }
            },
            switchSpecificAccount() {
                const targetIndex = this.selectedAccount;

                if (this.currentAuthIndex === targetIndex) {
                    ElementPlus.ElMessage.warning(this.t('alreadyCurrentAccount'));
                    return;
                }

                const targetAccount = this.accountDetails.find(acc => acc.index === targetIndex);
                const accountSuffix = targetAccount ? ` (${targetAccount.name})` : '';

                ElementPlus.ElMessageBox.confirm(
                    `${this.t('confirmSwitch')} #${targetIndex}${accountSuffix}?`,
                    {
                        cancelButtonText: this.t('cancel'),
                        confirmButtonText: this.t('ok'),
                        lockScroll: false,
                        type: 'warning',
                    }
                )
                    .then(async () => {
                        const notification = ElementPlus.ElNotification({
                            duration: 0,
                            message: this.t('switchingAccountNotice'),
                            title: this.t('warningTitle'),
                            type: 'warning',
                        });
                        this.isSwitchingAccount = true;
                        try {
                            const res = await fetch('/api/accounts/current', {
                                body: JSON.stringify({ targetIndex }),
                                headers: { 'Content-Type': 'application/json' },
                                method: 'PUT',
                            });
                            const data = await res.json();
                            const message = this.t(data.message, data);
                            if (res.ok) {
                                ElementPlus.ElMessage.success(message);
                            } else {
                                ElementPlus.ElMessage.error(message);
                            }
                        } catch (err) {
                            ElementPlus.ElMessage.error(
                                this.t('settingFailed', { message: err.message || err })
                            );
                        } finally {
                            this.isSwitchingAccount = false;
                            notification.close();
                            window.updateContent?.();
                        }
                    })
                    .catch(e => {
                        if (e !== 'cancel') {
                            console.error(e);
                        }
                    });
            },
            t(key, options) {
                // Access this.lang to create a dependency for reactivity
                this.lang;
                return I18n.t(key, options);
            },
            toggleLanguage() {
                return I18n.toggleLang();
            },
            updateStatus(data) {
                this.serviceConnected = true;
                if (this.isInitializing) {
                    this.isInitializing = false;
                }
                const isEnabled = val => {
                    if (val === true) return true;
                    if (val === 1) return true;
                    if (String(val).toLowerCase() === 'true') return true;
                    return false;
                };
                this.isUpdating = true;
                this.streamingModeReal = data.status.streamingMode === 'real';
                this.forceThinkingEnabled = isEnabled(data.status.forceThinking);
                this.forceWebSearchEnabled = isEnabled(data.status.forceWebSearch);
                this.forceUrlContextEnabled = isEnabled(data.status.forceUrlContext);
                this.currentAuthIndex = data.status.currentAuthIndex;
                this.accountDetails = data.status.accountDetails || [];
                this.browserConnected = data.status.browserConnected;
                this.apiKeySource = data.status.apiKeySource;
                this.usageCount = data.status.usageCount;
                this.failureCount = data.status.failureCount;
                this.logCount = data.logCount;
                this.logs = data.logs;
                this.initialIndicesRaw = data.status.initialIndicesRaw;
                this.invalidIndicesRaw = data.status.invalidIndicesRaw;
                this.accountNameMap = data.status.accountDetails.reduce((acc, item) => {
                    acc[item.index] = item.name;
                    return acc;
                }, {});

                const isSelectedAccountValid = this.accountDetails.some(acc => acc.index === this.selectedAccount);

                if (!isSelectedAccountValid) {
                    const isActiveAccountValid = this.accountDetails.some(acc => acc.index === this.currentAuthIndex);
                    this.selectedAccount = isActiveAccountValid ? this.currentAuthIndex : null;
                }

                this.$nextTick(() => {
                    this.isUpdating = false;

                    //TODO: Temp resolution to solve "force*" display
                    if (window.I18n) {
                        window.I18n.applyI18n();
                        const realLang = window.I18n.getLang();

                        if (this.lang === realLang) {
                            this.lang = realLang + '_force_refresh';
                            this.$nextTick(() => {
                                this.lang = realLang;
                            });
                        } else {
                            this.lang = realLang;
                        }
                    }
                });
            },
        },
        watch: {
            isSwitchingAccount(newVal) {
                const selectEl = document.getElementById('account-index-select');
                if (selectEl) {
                    selectEl.disabled = newVal;
                }
            },
        },
    });

    window.vueApp = app.use(ElementPlus)
        .mount('#app');
})();
