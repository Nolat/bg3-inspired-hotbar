import { BG3Component } from "../component.js";
import { AbilityContainer } from "./AbilityContainer.js";
import { DeathSavesContainer } from "./DeathSavesContainer.js";
import { MenuContainer } from "./MenuContainer.js";
import { BG3CONFIG } from "../../utils/config.js";
import { PortraitHealth } from "./PortraitHealth.js";
import { fromUuid } from "../../utils/foundryUtils.js";

export class PortraitContainer extends BG3Component {
    constructor(data) {
        super(data);
        this.components = {};
        this.useTokenImage = this.actor.getFlag(BG3CONFIG.MODULE_NAME, "useTokenImage") ?? false;
        this.scaleTokenImage = this.actor.getFlag(BG3CONFIG.MODULE_NAME, "scaleTokenImage") ?? false;
    }

    get classes() {
        return ["bg3-portrait-container"]
    }

    get img() {
        return (async () => {
            const saved = await this.actor.getFlag(BG3CONFIG.MODULE_NAME, "useTokenImage");
            if (saved !== undefined) this.useTokenImage = saved;
            else {
                const defaultPref = game.settings.get(BG3CONFIG.MODULE_NAME, 'defaultPortraitPreferences');
                this.useTokenImage = defaultPref === 'token';
            }
            return this.useTokenImage ? this.token.document.texture.src : this.actor.img;
        })();
    }

    get health() {
        const hpValue = this.actor.system.attributes?.hp?.value || 0;
        const hpMax = this.actor.system.attributes?.hp?.max || 1;
        const hpPercent = Math.max(0, Math.min(100, (hpValue / hpMax) * 100));
        const damagePercent = 100 - hpPercent;
        const tempHp = this.actor.system.attributes?.hp?.temp || 0;
        return {
            current: hpValue,
            max: hpMax,
            percent: hpPercent,
            damage: damagePercent,
            temp: tempHp
        }
    }

    get extraInfos() {
        return (async () => {
            const savedData = await game.settings.get(BG3CONFIG.MODULE_NAME, 'dataExtraInfo'),
                extraInfos = [];
            for (let i = 0; i < savedData.length; i++) {
                let extraData = {};
                const key = savedData[i].attr;
                if (key && key !== '') {
                    let value = null;
                    try {
                        // Template mode: resolve {{...}} tokens inside a single entry
                        if (key.includes('{{')) {
                            const tokenRegex = /\{\{([^}]+)\}\}/g;
                            let result = key;
                            let match;
                            const resolvedValues = [];
                            while ((match = tokenRegex.exec(key)) !== null) {
                                const token = match[1].trim();
                                const resolved = await this._resolvePortraitAttrToken(token);
                                resolvedValues.push(resolved);
                                result = result.replace(match[0], (resolved ?? '').toString());
                            }
                            // Trim stray leading/trailing separators if one side is missing
                            result = result.replace(/^[\s*/:|\-]+/, '').replace(/[\s*/:|\-]+$/, '');
                            // If all resolved values are empty/undefined, suppress output
                            const anyValue = resolvedValues.some(v => v !== undefined && v !== null && v !== '');
                            value = anyValue ? result : '';
                        }
                        // Literal value support: prefix with '=' to render as-is
                        else if (key.startsWith('=')) {
                            value = key.slice(1);
                        }
                        // Single token/path resolution
                        else {
                            value = await this._resolvePortraitAttrToken(key);
                        }
                    } catch (error) {
                        // Ignore resolution errors and leave value as null
                    }
                    if (value !== undefined && value !== null && value !== '') {
                        extraData = { icon: savedData[i].icon, value: value, color: savedData[i].color };
                    }
                }
                extraInfos.push(extraData);
            }
            return extraInfos;
        })();
    }

    _getInfoFromSettings(stringInfo) {
        try {
            const [module, data] = stringInfo.split('.');
            return game.settings.get(module, data);            
        } catch (error) {
            return null;
        }
    }

    async getData() {
        return {
            img: await this.img,
            health: this.health,
            opacity: 1,
            extraInfos: await this.extraInfos,
            hpControls: game.settings.get(BG3CONFIG.MODULE_NAME, 'enableHPControls')
        };
    }

    /**
     * Resolve a portrait attribute token into a string or primitive value.
     * Supports:
     *  - itemName:NAME[:path]
     *  - itemUuid:UUID[:path]
     *  - flags.namespace.key
     *  - direct actor/system paths (with optional .value fallback)
     * @param {string} token
     * @returns {Promise<*>}
     */
    async _resolvePortraitAttrToken(token) {
        let value = null;
        // Item-based lookups
        if (token.startsWith('itemName:') || token.startsWith('itemUuid:')) {
            const parts = token.split(':');
            const mode = parts.shift();
            const identifier = parts.shift();
            const path = parts.join(':');
            let itemDoc = null;
            if (mode === 'itemName') {
                itemDoc = this.actor.items.find((it) => (it.name || '').trim() === identifier.trim());
            } else if (mode === 'itemUuid') {
                try {
                    itemDoc = await fromUuid(identifier);
                } catch (e) {}
                if (!itemDoc && identifier?.includes('.')) {
                    itemDoc = this.actor.items.get(identifier.split('.').pop());
                }
            }
            if (itemDoc) {
                const targetPath = path && path.length ? path : 'system.uses.value';
                value = foundry.utils.getProperty(itemDoc, targetPath);
            }
        }
        // Absolute actor path (supports flags.* and other actor props)
        if (value === undefined || value === null) value = foundry.utils.getProperty(this.actor, token);
        // Fallback to system path and common ".value" nesting
        if (value === undefined || value === null) {
            value = foundry.utils.getProperty(this.actor.system, token) ?? foundry.utils.getProperty(this.actor.system, `${token}.value`);
        }
        // If flags.<namespace>.<key> format, try getFlag explicitly
        if ((value === undefined || value === null) && token.startsWith('flags.')) {
            const parts2 = token.split('.');
            if (parts2.length >= 3) {
                const namespace = parts2[1];
                const flagKey = parts2.slice(2).join('.');
                value = this.actor.getFlag(namespace, flagKey);
            }
        }
        // Fallback to module setting string: module.setting
        if (value === undefined || value === null) {
            value = this._getInfoFromSettings(token);
        }
        return value;
    }

    async _registerEvents() {
        const image = this.element.querySelector('.portrait-image-subcontainer');
        if(!image) return;

        this.element.addEventListener('dblclick', (event) => {
            if(game.settings.get(BG3CONFIG.MODULE_NAME, 'showSheetSimpleClick')) return;
            this.actor.sheet.render(true);
        });

        this.element.addEventListener('click', (event) => {
            if(!game.settings.get(BG3CONFIG.MODULE_NAME, 'showSheetSimpleClick')) return;
            this.actor.sheet.render(true);
        });

        $(this.element).on('contextmenu', '.portrait-image-container', async (event) => {
            await MenuContainer.toggle(this.getPortraitMenu(), this.element, event);
            $('div[data-key="token"] .menu-item-content input[type="checkbox"]').change(async (event) => {
                this.scaleTokenImage = !this.scaleTokenImage;
                await this.actor.setFlag(BG3CONFIG.MODULE_NAME, "scaleTokenImage", this.scaleTokenImage);
            });
        });
    }
    
    _parseAttributeInput(input) {
        const isEqual = input.startsWith("=");
        const isDelta = input.startsWith("+") || input.startsWith("-");
        const current = this.actor.system.attributes.hp.value;
        let v;

        // Explicit equality
        if ( isEqual ) input = input.slice(1);

        // Percentage change
        if ( input.endsWith("%") ) {
            const p = Number(input.slice(0, -1)) / 100;
            v = this.actor.system.attributes.hp.max * p;
        }

        // Additive delta
        else v = Number(input);

        // Return parsed input
        const value = isDelta ? current + v : v;
        const delta = isDelta ? v : undefined;
        return {value, delta, isDelta};
    }

    async updateImagePreference() {
        this.useTokenImage = !this.useTokenImage;
        await this.actor.setFlag(BG3CONFIG.MODULE_NAME, "useTokenImage", this.useTokenImage);
        this._renderInner();
    }

    setTokenImageScale() {
        const subContainer = this.element.querySelector('.portrait-image-subcontainer');
        const img = this.element.querySelector('.portrait-image');
        // Reset legacy img scale if any
        if(img) img.style.removeProperty('scale');
        if(!subContainer) return;
        const scaleX = this.token.document?._source?.texture?.scaleX ?? 1;
        if(!this.scaleTokenImage || !this.useTokenImage || scaleX === 1) {
            subContainer.style.removeProperty('transform');
        } else {
            subContainer.style.setProperty('transform', `scale(${scaleX})`);
        }
    }

    setImgBGColor() {
        const value = game.settings.get(BG3CONFIG.MODULE_NAME, 'backgroundPortraitPreferences');
        this.element.style.setProperty('--img-background-color', (value && value != '' ? value : 'transparent'));
    }

    async setPortraitBendMode() {
        const imageContainer = this.element.getElementsByClassName('portrait-image-subcontainer');
        const enabled = game.settings.get(BG3CONFIG.MODULE_NAME, 'overlayModePortrait');
        if(imageContainer[0]) {
            imageContainer[0].setAttribute('data-bend-mode', enabled);
            imageContainer[0].style.setProperty('--bend-img', `url(${this.element.querySelector('.portrait-image').src})`);
        }
        this.element.classList.toggle('use-bend-mask', !!enabled);
    }

    togglePortraitOverlay() {
        const overlay = this.element.getElementsByClassName('health-overlay');
        if(overlay && overlay[0]) overlay[0].classList.toggle('hidden', !game.settings.get(BG3CONFIG.MODULE_NAME, 'showHealthOverlay'));
    }

    toggleExtraInfos() {
        const text = this.element.getElementsByClassName('extra-infos-container');
        if(text && text[0]) text[0].classList.toggle('hidden', !game.settings.get(BG3CONFIG.MODULE_NAME, 'showExtraInfo'));
    }

    getPortraitMenu() {
        return {
            position: 'mouse',
            event: 'contextmenu',
            name: 'baseMenu',
            buttons: {
                token: {
                    label: 'Use Token Image', icon: 'fas fa-chess-pawn', custom: this.useTokenImage ? `<i class="fas fa-check"></i>${this.token.document._source.texture.scaleX !== 1 ? `<label for="input-token-scale" data-tooltip="Apply Token Scale" data-tooltip-direction="UP"><i class="fa-solid fa-up-right-and-down-left-from-center"${this.scaleTokenImage ? 'style="color: rgb(46, 204, 113)"' : ''}></i></label><input name="input-token-scale" type="checkbox"${this.scaleTokenImage ? ' checked' : ''}>` : ''}` : '', click: !this.useTokenImage ? this.updateImagePreference.bind(this) : (event) => {
                        if($(event.target).attr('for') === 'input-token-scale') $('div[data-key="token"] .menu-item-content input[type="checkbox"]').trigger('change');
                    }
                },
                portrait: {
                    label: 'Use Character Portrait', icon: 'fas fa-user', custom: !this.useTokenImage ? '<i class="fas fa-check"></i>' : '', click: this.useTokenImage ? this.updateImagePreference.bind(this) : () => {}
                }
            }
        }
    }

    applySettings() {
        this.element.setAttribute("data-shape", game.settings.get(BG3CONFIG.MODULE_NAME, 'shapePortraitPreferences'));
        this.element.setAttribute("data-border", game.settings.get(BG3CONFIG.MODULE_NAME, 'borderPortraitPreferences'));
        this.setImgBGColor();
        this.element.classList.toggle('portrait-hidden', game.settings.get(BG3CONFIG.MODULE_NAME, 'hidePortraitImage'));
        this.setPortraitBendMode();
        this.togglePortraitOverlay();
        this.toggleExtraInfos();
        this.setTokenImageScale();
    }
    
    async _renderInner() {
        await super._renderInner();
        this.applySettings();
        this.components = {};
        // Portrait Health
        this.components.healthContainer = new PortraitHealth({}, this);
        this.components.healthContainer.render();
        this.element.appendChild(this.components.healthContainer.element);
        // Death Save
        this.components.deathSavesContainer = new DeathSavesContainer();
        this.components.deathSavesContainer.render();
        this.element.appendChild(this.components.deathSavesContainer.element);
        // Ability Container 
        this.components.abilityContainer = new AbilityContainer();
        this.components.abilityContainer.render();
        this.element.appendChild(this.components.abilityContainer.element);
    }
}