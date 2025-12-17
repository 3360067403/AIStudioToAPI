/**
 * File: status.js
 * Description: Client-side script for the status page, providing real-time service monitoring and control
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

/* global I18n */

(() => {
    const updateContent = () => {
        const dot = document.querySelector('.dot');
        return fetch('/api/status')
            .then(r => {
                if (r.redirected) {
                    window.location.href = r.url;
                    return Promise.reject(new Error('Redirecting to login'));
                }
                if (!r.ok) {
                    return Promise.reject(new Error(`HTTP error! status: ${r.status}`));
                }
                return r.json();
            })
            .then(data => {
                if (dot) {
                    dot.className = 'dot status-running';
                }
                if (window.vueApp && window.vueApp.updateStatus) {
                    window.vueApp.updateStatus(data);
                }
            })
            .catch(err => {
                console.error('Error fetching status:', err.message);
                if (dot) {
                    dot.className = 'dot status-error';
                }
                if (window.vueApp) {
                    window.vueApp.serviceConnected = false;
                }
            });
    };

    const scheduleNextUpdate = () => {
        const randomInterval = 4000 + Math.floor(Math.random() * 3000);
        setTimeout(() => {
            updateContent().finally(scheduleNextUpdate);
        }, randomInterval);
    };

    document.addEventListener('DOMContentLoaded', async () => {
        if (!window.I18n) {
            console.error('I18n library not found!');
            return;
        }

        try {
            await I18n.init();
            I18n.applyI18n();

            if (window.vueApp) {
                window.vueApp.lang = I18n.getLang();
            }

            I18n.onChange(lang => {
                if (window.vueApp) {
                    window.vueApp.lang = lang;
                }
                I18n.applyI18n();
            });

            // Start the update loop after everything is initialized
            updateContent().finally(scheduleNextUpdate);
        } catch (error) {
            console.error('Failed to initialize I18n or start status updates:', error);
        }
    });

    window.updateContent = updateContent;
})();
