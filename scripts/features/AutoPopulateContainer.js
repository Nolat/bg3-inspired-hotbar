import { BG3CONFIG, shouldEnforceSpellPreparation } from "../utils/config.js";
import { AutoSort } from "./AutoSort.js";

export class AutoPopulateContainer {
  static async populateContainer(container, itemTypes = []) {
    const dialog = new AutoPopulateDialog(container);
    return dialog._populateContainer(itemTypes);
  }

  static _getExistingUuids() {
    const existingUuids = new Set();
    if (!ui.BG3HOTBAR?.components?.container?.components?.hotbar) return existingUuids;
    
    for (const gridContainer of ui.BG3HOTBAR.components.container.components.hotbar) {
      for (const slotKey in gridContainer.data.items) {
        const item = gridContainer.data.items[slotKey];
        if (item && item.uuid) {
          existingUuids.add(item.uuid);
        }
      }
    }
    return existingUuids;
  }

  static async _addItemsToContainer(items, container) {
    let addedCount = 0;
    
    try {
      // Check if we have permission to modify the actor
      if (!ui.BG3HOTBAR.manager.actor?.canUserModify(game.user, "update")) {
        console.debug("BG3 Inspired Hotbar | User lacks permission to modify token actor");
        return 0;
      }

      addedCount = await this._addItemsExpandingContainer(items, container);
      
      // Render container and persist changes if we still have permission
      if (container.render) {
        container.render();
      }
      if (ui.BG3HOTBAR?.manager?.persist && ui.BG3HOTBAR.manager.actor?.canUserModify(game.user, "update")) {
        await ui.BG3HOTBAR.manager.persist();
      }
      
      return addedCount;
    } catch (error) {
      console.error("Error adding items to container:", error);
      return 0;
    }
  }

  static async _addItemsExpandingContainer(items, container) {
    let addedCount = 0;
    const cols = container.data?.cols;
    const rows = container.data?.rows;
    
    // Ensure container has proper data structure
    if (!container.data) {
      container.data = { items: {}, cols, rows };
    }
    if (!container.data.items) {
      container.data.items = {};
    }
    
    let r = 0;
    let c = 0;
    
    while (addedCount < items.length) {
      const slotKey = `${c}-${r}`;
      
      if (!container.data.items[slotKey]) {
        container.data.items[slotKey] = items[addedCount];
        addedCount++;
      }
      
      // Move right first, then down (rows first)
      c++;
      if (c >= cols) {
        c = 0;
        r++;
      }
    }
    
    return addedCount;
  }
}

export class AutoPopulateDialog extends Dialog {
    constructor(container) {
        const dialogData = {
            title: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.DialogTitle"),
            content: "",
            buttons: {
            submit: {
                icon: '<i class="fas fa-save"></i>',
                label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Populate"),
                callback: async (html) => {
                const selectedTypes = Array.from(html.find('.chip.active')).map(chip => chip.dataset.value);
                
                if (selectedTypes.length === 0) {
                    ui.notifications.warn("Please select at least one item type to populate.");
                    return;
                }
    
                try {
                    ui.notifications.info("Populating container...");
                    await this._populateContainer(selectedTypes);
                    ui.notifications.info("Container populated successfully.");
                } catch (error) {
                    console.error("Error populating container:", error);
                    ui.notifications.error("Failed to populate container. See console for details.");
                }
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Cancel")
            }
            },
            default: "submit"
        };
    
        const options = {
            classes: ["bg3-hotbar-dialog", "auto-populate-dialog"],
            width: 800,
            height: "auto",
            jQuery: true,
            template: `modules/${BG3CONFIG.MODULE_NAME}/templates/dialog/auto-populate-container.html`
        };

        super(dialogData, options);
        this.actor = ui.BG3HOTBAR.manager.actor;
        this.container = container;
    }

    getData(options={}) {
        const data = super.getData(options);
        data.itemTypes = [
            { value: "weapon", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Weapons") },
            { value: "feat", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Features") },
            { value: "spell", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Spells") },
            { value: "equipment", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Equipment") },
            // Replace single "consumable" with individual subtypes
            { value: "consumable:potion", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Potions") },
            { value: "consumable:scroll", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Scrolls") },
            { value: "consumable:ammo", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Ammunition") },
            { value: "consumable:food", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Food") },
            { value: "consumable:wand", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Wands") },
            { value: "consumable:rod", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Rods") },
            { value: "consumable:poison", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Poisons") },
            { value: "consumable:trinket", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Trinkets") },
            { value: "tool", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Tools") },
            { value: "loot", label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Loot") }
        ];
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Handle chip clicks
        html.find('.chip').on('click', function() {
            $(this).toggleClass('active');
        });
    }
    
    async _populateContainer(selectedTypes) {
        if (!this.actor) return;
    
        try {
          // Get all items from the actor that match the selected types
          const itemsWithActivities = [];
          
          // Process all items from the actor
          for (const item of this.actor.items) {
            // Enhanced filtering logic to handle consumable subtypes
            let includeItem = false;
            
            for (const selectedType of selectedTypes) {
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
                  if (item.type === "feat") {
                    includeItem = item.labels.featType != game.i18n.localize('DND5E.Passive')
                  } else {
                    includeItem = true;
                  }
                  break;
                }
              }
            }
            
            // Skip if item doesn't match any selected types or is already in hotbar
            if (!includeItem
              || Object.values(ui.BG3HOTBAR.components.weapon.components.combat[0].data.items).find(i => i.uuid === item.uuid)
              || ui.BG3HOTBAR.components.weapon?.components?.weapon?.reduce((acc, curr) => acc.concat(Object.values(curr.data.items)), []).find(i => i.uuid === item.uuid)
            ) continue;
            
            // For spells, check preparation state unless bypassed by setting
            if (item.type === "spell") {
              const enforcePreparation = shouldEnforceSpellPreparation(this.actor, ui.BG3HOTBAR.manager.currentTokenId);
                
              if (enforcePreparation) {
                const prep = item.system?.preparation;
                // Skip if it's an unprepared "prepared" spell
                if (!prep?.prepared && prep?.mode === "prepared") continue;
                // Include if it's prepared or has a valid casting mode
                if (!prep?.prepared && !["pact", "apothecary", "atwill", "innate", "ritual", "always"].includes(prep?.mode)) continue;
              }
            }
            
            // Check if the item has activities or is usable
            const activities = item.system?.activities;
            const hasActivities = (activities instanceof Map && activities.size > 0) ||
                                (item.system?.activation?.type && item.system?.activation?.type !== "none");
            
            if (hasActivities || game.settings.get(BG3CONFIG.MODULE_NAME, 'noActivityAutoPopulate')) {
              itemsWithActivities.push({
                uuid: item.uuid,
              });
            }
          }
          
          if (itemsWithActivities.length === 0) {
            ui.notifications.warn("No items found matching the selected criteria.");
            return;
          }
    
          // Sort items by type order
          AutoSort._sortItems(itemsWithActivities);
          
          // Get existing UUIDs to prevent duplicates
          const existingUuids = AutoPopulateContainer._getExistingUuids();
          
          // Filter out items that already exist in the hotbar
          const newItems = itemsWithActivities.filter(item => !existingUuids.has(item.uuid));
          
          if (newItems.length === 0) {
            ui.notifications.warn("All matching items are already in the hotbar.");
            return;
          }
    
          // Clear the container if requested
          if (this.container.data.items === undefined) {
            this.container.data = { items: {}, cols: this.container.data.cols, rows: this.container.data.rows };
          }
          
          // Add items to container
          const addedCount = await AutoPopulateContainer._addItemsToContainer(newItems, this.container);
          
          if (addedCount > 0) {
            ui.notifications.info(`Added ${addedCount} items to the hotbar.`);
          } else {
            ui.notifications.warn("No items could be added to the hotbar.");
          }
          
        } catch (error) {
          console.error("BG3 Inspired Hotbar | Error auto-populating hotbar:", error);
          ui.notifications.error("Error populating hotbar. See console for details.");
          throw error;
        }
    }
}