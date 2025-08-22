import { BG3CONFIG } from "../../utils/config.js";

export class ExtraInfosDialog extends FormApplication {
    constructor () {
        super();
    }

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: 'Portrait extra datas settings',
            id: "bg3-inspired-hotbar-extradatas-settings",
            template: `modules/bg3-inspired-hotbar/templates/dialog/extra-infos-dialog.hbs`,
            width: 1000,
            height: "auto",
            submitOnClose: false,
            resizable: true
        };
    }

    getData() {
        let listAttr = TokenDocument.implementation.getTrackedAttributes();
        listAttr.bar.forEach(a => a.push("value"));
        const listAttrChoices = TokenDocument.implementation.getTrackedAttributeChoices(listAttr);
        return {extraInfos: game.settings.get(BG3CONFIG.MODULE_NAME, "dataExtraInfo"), listAttrChoices};
    }

    activateListeners(html) {
        super.activateListeners(html);
        html[0].querySelectorAll(".list-attr").forEach((select) => {
            select.addEventListener("change", (event) => {
                const value = event.target.value;
                const inputAttr = event.target.closest(".form-group").querySelector(".attr");
                inputAttr.value = value;
            });
        });

        // Icon picker
        html[0].querySelectorAll('.icon-picker').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                const container = event.currentTarget.closest('.form-group');
                const input = container.querySelector('.icon');
                this._openIconPicker(input);
            });
        });
    }

    async _onSubmit(event) {
        event.preventDefault();
        let data = [];
        const form = this.element[0].querySelectorAll('div.container-section');
        for (let i = 0; i < form.length; i++) {
            const attr = form[i].querySelector(".attr").value;
            const icon = form[i].querySelector(".icon").value;
            const color = form[i].querySelector(".color").value;
            const pos = form[i].querySelector(".notes").innerHTML;
            data.push({attr, icon, color, pos})
        }
        await game.settings.set(BG3CONFIG.MODULE_NAME, "dataExtraInfo", data);
        this.close();
    }

    /**
     * Simple Font Awesome icon picker popup.
     * Renders a lightweight grid of common FA icons and writes the chosen class into the input.
     */
    _openIconPicker(targetInput) {
        const commonIcons = [
            'fa-bolt','fa-star','fa-heart','fa-shield-alt','fa-crosshairs','fa-fire','fa-snowflake',
            'fa-flask','fa-moon','fa-sun','fa-skull','fa-feather','fa-dragon','fa-book','fa-book-open','fa-dice-d20',
            'fa-hand-paper','fa-magic','fa-hat-wizard','fa-fist-raised','fa-wine-bottle','fa-bread-slice','fa-bomb','fa-bullseye',
            'fa-compass','fa-map','fa-map-marked-alt','fa-flag','fa-hourglass-half','fa-trophy','fa-key','fa-lock','fa-unlock',
            'fa-magnet','fa-microphone','fa-music','fa-paw','fa-rocket','fa-user-shield','fa-user-ninja','fa-user-secret',
            'fa-eye','fa-eye-slash','fa-bell','fa-certificate','fa-chess-knight','fa-chess-rook','fa-chess-queen','fa-chess-bishop',
            'fa-hammer','fa-cogs','fa-tools'
        ];

        const content = `
            <div class="bg3-icon-picker-note" style="margin-bottom:8px;">
                Tip: Click an icon to select. For more, visit <a href="https://fontawesome.com/icons" target="_blank" rel="noopener">fontawesome.com/icons</a> and paste a class like <code>fa-bolt</code>.
            </div>
            <div class="bg3-icon-picker" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;max-height:300px;overflow:auto;">
                ${commonIcons.map(ic => `<button type="button" class="bg3-icon-btn" data-icon="${ic}" style="display:flex;align-items:center;justify-content:center;height:36px;border:1px solid var(--color-border-light-primary, #999);border-radius:4px;"><i class="fas ${ic}"></i></button>`).join('')}
            </div>
        `;

        const picker = new Dialog({
            title: 'Pick an Icon',
            content: content,
            buttons: {
                none: {
                    label: 'Clear',
                    icon: '<i class="fas fa-times"></i>',
                    callback: () => { targetInput.value = ''; }
                },
                ok: {
                    label: 'Close',
                    icon: '<i class="fas fa-check"></i>'
                }
            },
            default: 'ok'
        });
        picker.render(true);

        // After render, attach event handlers to buttons (robust to first-render timing)
        const attachHandlers = () => {
            // Prefer local query within dialog element if available
            let root = picker.element;
            if (root && root[0]) root = root[0];
            let buttons = [];
            if (root && typeof root.querySelectorAll === 'function') {
                buttons = Array.from(root.querySelectorAll('.bg3-icon-btn'));
            }
            // Fallback to document if dialog element not yet available
            if (!buttons.length) {
                buttons = Array.from(document.querySelectorAll('.bg3-icon-picker .bg3-icon-btn'));
            }
            if (!buttons.length) {
                // Try again on next frame until mounted
                return void setTimeout(attachHandlers, 25);
            }
            buttons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const ic = btn.getAttribute('data-icon');
                    targetInput.value = `fas ${ic}`;
                    picker.close();
                }, { once: true });
            });
        };
        attachHandlers();
    }
}