// Auto Populate Create Token Feature
// Handles populating hotbar when creating unlinked tokens

import { BG3CONFIG, shouldEnforceSpellPreparation } from '../utils/config.js';
import { HotbarManager } from '../managers/HotbarManager.js';
import { AutoSort } from './AutoSort.js';

export class AutoPopulateDefaults extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "bg3-hotbar-auto-populate-defaults",
            title: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.DefaultsTitle"),
            template: `modules/${BG3CONFIG.MODULE_NAME}/templates/dialog/auto-populate-defaults.html`,
            width: 800,
            height: "auto",
            closeOnSubmit: true,
            submitOnClose: false
        });
    }

    getData() {
        // Get current settings for each container
        const containerSettings = {
            container1: game.settings.get(BG3CONFIG.MODULE_NAME, 'container1AutoPopulate'),
            container2: game.settings.get(BG3CONFIG.MODULE_NAME, 'container2AutoPopulate'),
            container3: game.settings.get(BG3CONFIG.MODULE_NAME, 'container3AutoPopulate'),
            allowPassive: game.settings.get(BG3CONFIG.MODULE_NAME, 'noActivityAutoPopulate')
        };

        // Define available choices
        const choices = {
            weapon: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Weapons"),
            feat: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Features"),
            spell: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Spells"),
            equipment: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Equipment"),
            // Replace single "consumable" with individual subtypes
            "consumable:potion": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Potions"),
            "consumable:scroll": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Scrolls"),
            "consumable:ammo": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Ammunition"),
            "consumable:food": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Food"),
            "consumable:wand": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Wands"),
            "consumable:rod": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Rods"),
            "consumable:poison": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Poisons"),
            "consumable:trinket": game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Trinkets"),
            tool: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Tools"),
            loot: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Loot")
        };

        // Register the includes helper if it doesn't exist
        if (!Handlebars.helpers.includes) {
            Handlebars.registerHelper('includes', function(array, value) {
                return array?.includes(value) ?? false;
            });
        }

        return {
            containerSettings,
            choices
        };
    }

    async _updateObject(event, formData) {
        try {
            // Update all container settings
            const containers = ['container1', 'container2', 'container3'];
            for (const container of containers) {
                const selectedTypes = Array.from(this.element[0].querySelectorAll(`.container-chips[data-container="${container}"] .chip.active`))
                    .map(chip => chip.dataset.value);
                
                await game.settings.set(BG3CONFIG.MODULE_NAME, `${container}AutoPopulate`, selectedTypes);
            }
            await game.settings.set(BG3CONFIG.MODULE_NAME, `noActivityAutoPopulate`, this.element[0].querySelector("#passive-populate-checkbox").checked);
            ui.notifications.info(game.i18n.localize("BG3.Settings.ContainerAutoPopulate.SaveSuccess"));
        } catch (error) {
            console.error("Error saving container settings:", error);
            ui.notifications.error("Error saving container settings");
        }
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Handle chip clicks
        html.find('.chip').on('click', event => {
            event.preventDefault();
            const chip = event.currentTarget;
            chip.classList.toggle('active');
        });
    }
}

export class AutoPopulateCreateToken {
    static async populateUnlinkedToken(token, force = false) {
        if (!token?.actor) return;

        try {
            // Do not auto-populate for player characters
            if (token.actor.type === 'character') return;
            // Check if user has permission to modify this token
            if (!token.actor.canUserModify(game.user, "update")) {
                console.debug("BG3 Inspired Hotbar | User lacks permission to modify token actor");
                return;
            }

            // Create a temporary hotbar manager for this token
            const tempManager = new HotbarManager();
            tempManager.currentTokenId = token.id;
            await tempManager._loadTokenData();
            
            // Auto-populate combat container if setting on true
            if(!(!tempManager.containers.combat[0]?.items || Object.values(tempManager.containers.combat[0].items).length > 0)) {
                if((game.settings.get(BG3CONFIG.MODULE_NAME, 'autoPopulateCombatContainer') || force) && token.actor.type !== 'vehicle') {
                    if(force) tempManager.containers.combat[0].items = {};
                    await this._populateCommonActions(token.actor, tempManager);
                }
            }

            if((!token.actorLink && (game.settings.get(BG3CONFIG.MODULE_NAME, 'autoPopulateUnlinkedTokens') || force)) || (token.actorLink && (game.settings.get(BG3CONFIG.MODULE_NAME, 'autoPopulateLinkedTokens') || force))) {
                // Get settings for each container
                const container1Setting = game.settings.get(BG3CONFIG.MODULE_NAME, 'container1AutoPopulate');
                const container2Setting = game.settings.get(BG3CONFIG.MODULE_NAME, 'container2AutoPopulate');
                const container3Setting = game.settings.get(BG3CONFIG.MODULE_NAME, 'container3AutoPopulate');
                
                // Check if NPCs should use container defaults instead of weapon sets
                const npcUseContainerDefaults = game.settings.get(BG3CONFIG.MODULE_NAME, 'npcUseContainerDefaults');
      
                // Process weapon sets only if NPCs are not using container defaults
                if (!npcUseContainerDefaults) {
                    // Process each weapon & combat containers
                    if(force) {
                        tempManager.containers.weapon[0].items = {};
                        tempManager.containers.weapon[1].items = {};
                        tempManager.containers.weapon[2].items = {};
                    }
                    await this._populateWeaponsToken(token.actor, tempManager);
                }
    
                // Process each container
                if(force) {
                    tempManager.containers.hotbar[0].items = {};
                    tempManager.containers.hotbar[1].items = {};
                    tempManager.containers.hotbar[2].items = {};
                }
                await this._populateContainerWithSettings(token.actor, tempManager, 0, container1Setting);
                await this._populateContainerWithSettings(token.actor, tempManager, 1, container2Setting);
                await this._populateContainerWithSettings(token.actor, tempManager, 2, container3Setting);
            }

            // Auto-enable all passive features for NPCs
            if (token.actor.type !== 'character') {
                await this._autoEnablePassiveFeatures(token.actor);
            }

            // Save the changes only if we still have permission
            if (token.actor.canUserModify(game.user, "update")) await tempManager.persist();

        } catch (error) {
            console.error("BG3 Inspired Hotbar | Error auto-populating unlinked token hotbar:", error);
        }
    }

    static async _populateContainerWithSettings(actor, manager, containerIndex, itemTypes) {
        if (!actor?.items || !manager?.containers?.hotbar || !itemTypes?.length) return;
        
        const container = manager.containers.hotbar[containerIndex];
        if (!container) return;

        try {
            // Get all items from the actor that match the selected types
            const itemsWithActivities = [];

            // Process all items from the actor
            for (const item of actor.items) {
                // Enhanced filtering logic to handle consumable subtypes
                let includeItem = false;
                
                for (const selectedType of itemTypes) {
                  if (selectedType.includes(':')) {
                    // Handle subtype (e.g., "consumable:potion")
                    const [mainType, subType] = selectedType.split(':');
                    if (item.type === mainType && item.system?.type?.value === subType) {
                      includeItem = true;
                      break;
                    }
                  } else {
                    // Handle main type (e.g., "weapon")
                    if (item.type === selectedType) {
                      includeItem = true;
                      break;
                    }
                  }
                }
                
                // Skip if item doesn't match any selected types or is already in hotbar
                if (!includeItem
                    || Object.values(manager.containers.combat[0].items).find(d => d.uuid === item.uuid)
                    || manager.containers.weapon.reduce((acc, curr) => acc.concat(Object.values(curr.items)), []).find(i => i.uuid === item.uuid)
                ) continue;
                
                // For spells, check preparation state unless bypassed by setting
                if (item.type === "spell") {
                    const enforcePreparation = shouldEnforceSpellPreparation(actor, manager.currentTokenId);
                        
                    if (enforcePreparation) {
                        const method = item.system?.method ?? item.system?.preparation?.mode;
                        const prepared = item.system?.prepared ?? item.system?.preparation?.prepared;
                        // Skip if it's an unprepared "prepared" spell
                        if (!prepared && method === "prepared") continue;
                        // Include if it's prepared or has a valid casting mode
                        if (!prepared && !["pact", "apothecary", "atwill", "innate", "ritual", "always"].includes(method)) continue;
                    }
                }
                
                // Check if the item has activities or is usable
                const activities = item.system?.activities;
                const hasActivities = (activities instanceof Map && activities.size > 0) ||
                                    (item.system?.activation?.type && item.system?.activation?.type !== "none");
                
                if (hasActivities || game.settings.get(BG3CONFIG.MODULE_NAME, 'noActivityAutoPopulate')) {
                    const itemData = {
                        uuid: item.uuid,
                        // name: item.name,
                        // icon: item.img,
                        // type: item.type,
                        // activation: item.system?.activation?.type || "action",
                        // sortData: {
                        //     spellLevel: item.type === "spell" ? item.system?.level ?? 99 : 99,
                        //     featureType: item.type === "feat" ? item.system?.type?.value ?? "" : "",
                        //     name: item.name
                        // }
                    };

                    itemsWithActivities.push(itemData);
                }
            }
            
            if (itemsWithActivities.length === 0) return;

            // Sort items using unified sorter with fresh data
            const sortedItems = await AutoSort.sortUuidEntries(itemsWithActivities);

            // Place items in grid format (rows first: left to right, then down)
            let x = 0;
            let y = 0;

            for (const item of sortedItems) {
                if (y >= container.rows) break; // Stop if we exceed container rows

                const gridKey = `${x}-${y}`;
                container.items[gridKey] = item;
                // container.data.items[gridKey] = item;

                // Move right first, then down (rows first)
                x++;
                if (x >= container.cols) {
                    x = 0;
                    y++;
                }
            }
            
        } catch (error) {
            console.error("BG3 Inspired Hotbar | Error auto-populating container:", error);
        }
    }

    static async _populateWeaponsToken(actor, manager) {
      if (!actor?.items || !manager?.containers?.weapon) return;

      try {
        // Process each container
        let weaponsList = actor.items.filter(w => w.type == 'weapon'),
          toUpdate = [];
        if(weaponsList.length) {
          for(let i = 0; i < weaponsList.length; i++) {
            const gridKey = `0-0`,
              item = weaponsList[i];
            if(i < 3) {
              manager.containers.weapon[i].items = {};
              const itemData = {uuid: item.uuid};
              manager.containers.weapon[i].items[gridKey] = itemData;
            }
            if((i === 0 && !item.system.equipped) || (i > 0 && item.system.equipped)) toUpdate.push({_id: item.uuid.split('.').pop(), "system.equipped": (i === 0 ? 1 : 0)})
          }
          actor.updateEmbeddedDocuments("Item", toUpdate);
        }     
      } catch (error) {
          console.error("BG3 Inspired Hotbar | Error auto-populating weapons token hotbar:", error);
      }
    }

    static async _getCombatActionsList(actor) {
        let ids = [];
        if (game.modules.get("chris-premades")?.active && game.packs.get("chris-premades.CPRActions")?.index?.size) {
            const pack = game.packs.get("chris-premades.CPRActions");
            const chosen = game.settings.get(BG3CONFIG.MODULE_NAME, 'choosenCPRActions') || [];
            const toCreate = [];

            for (const id of chosen) {
                const idxEntry = pack.index.get(id);
                if (!idxEntry) continue;

                // Prefer robust match by system.identifier; fallback to case-insensitive name match
                const targetIdentifier = idxEntry.system?.identifier;
                const targetName = (idxEntry.name || '').toLowerCase();
                const existing = actor.items.find((it) => {
                    const sameIdentifier = targetIdentifier && it.system?.identifier === targetIdentifier;
                    const sameName = targetName && (it.name || '').toLowerCase() === targetName;
                    return sameIdentifier || sameName;
                });

                if (existing) {
                    ids.push(existing.uuid);
                    continue;
                }

                toCreate.push(idxEntry._id);
            }

            if (toCreate.length) {
                const docs = await Promise.all(toCreate.map(async (_id) => pack.getDocument(_id)));
                // Suppress hotbar auto-add during CPR common actions creation
                const created = await actor.createEmbeddedDocuments('Item', docs, { noBG3AutoAdd: true });
                ids = ids.concat(created.map((i) => i.uuid));
            }
        } else {
            const compendium = await game.packs.get("bg3-inspired-hotbar.bg3-inspired-hud");
            if(!compendium) return ids;
            ids = compendium.folders.find(f => f.name === 'Common Actions').contents.map(m => m.uuid);
        }
        return ids;
    }

    static async _populateCommonActions(actor, manager) {
        if(actor.type == 'vehicle') return;
        try {
            const ids = await this._getCombatActionsList(actor);
            let count = 0;
            for(let i = 0; i < 3; i++) {
                for(let j = 0; j < 3; j++) {
                    if(ids[count]) manager.containers.combat[0].items[`${i}-${j}`] = {uuid: ids[count]};
                    count++;
                }
            }
        } catch (error) {
            console.error("BG3 Inspired Hotbar | Error auto-populating common actions token hotbar:", error);
        }
    }

    /**
     * Auto-enable all passive features for NPCs
     * @param {Actor} actor - The actor to configure passive features for
     */
    static async _autoEnablePassiveFeatures(actor) {
        if (!actor?.items) return;

        try {
            // Get all passive features (feats with no activities)
            const passiveFeatures = actor.items
                .filter(item => {
                    return item.type === "feat" && 
                           item.system.activities instanceof Map && 
                           item.system.activities.size === 0;
                })
                .map(item => item.uuid);

            // Only set the flag if there are passive features and none are currently selected
            if (passiveFeatures.length > 0) {
                const currentSelection = actor.getFlag(BG3CONFIG.MODULE_NAME, "selectedPassives");
                if (!currentSelection || currentSelection.length === 0) {
                    await actor.setFlag(BG3CONFIG.MODULE_NAME, "selectedPassives", passiveFeatures);
                }
            }
        } catch (error) {
            console.error("BG3 Inspired Hotbar | Error auto-enabling passive features:", error);
        }
    }
}