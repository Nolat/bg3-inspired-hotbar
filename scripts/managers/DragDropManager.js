import { BG3CONFIG } from '../utils/config.js';
import { fromUuid } from '../utils/foundryUtils.js';
import { ContainerPopover } from '../components/containers/ContainerPopover.js';

export class DragDropManager {
    constructor() {
        this.draggedItem = null;
        this.dragSourceCell = null;
    }

    get locked() {

    }

    async _isDuplicate(uuid) {
        // Check all containers for the UUID
        for (const container of ui.BG3HOTBAR.manager.containers.hotbar) {
            for (const item of Object.values(container.items)) {
                if (item?.uuid === uuid) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if a cell belongs to a temporary container
     * @param {GridCell} cell - The cell to check
     * @returns {boolean} True if the cell belongs to a temporary container
     */
    _isTemporaryContainer(cell) {
        if (!cell?._parent?.id) return false;
        // Check if it's a container popover
        return cell._parent.id.startsWith('container_');
    }

    async proceedDrop(target, event) {
        if(this.dragSourceCell === target) return;
        let hasUpdate = false;
        

        try {
            const savedItem = foundry.utils.deepClone(target.data.item);
            let newItem = null;
            if(this.dragSourceCell) {
                newItem = foundry.utils.deepClone(this.dragSourceCell.data.item);
                this.dragSourceCell.data.item = savedItem;

                // Update manager stored data
                const containerType = this.dragSourceCell._parent.id;
                const containerIndex = this.dragSourceCell._parent.index;
                
                // Safety check for null containerType
                if (!containerType) {
                    console.warn("BG3 DragDrop | Container type is null, skipping update");
                    return;
                }
                
                // Handle both regular containers and container popovers
                if (containerType.startsWith('container_')) {
                    // Container popover - update the GridContainer data directly
                    const popover = ContainerPopover.activePopover;
                    if (popover && popover.gridContainer) {
                        popover.gridContainer.data.items[this.dragSourceCell.slotKey] = savedItem;
                    }
                } else if (ui.BG3HOTBAR.manager.containers?.[containerType]?.[containerIndex]) {
                    // Regular containers (hotbar, weapon, combat)
                    ui.BG3HOTBAR.manager.containers[containerType][containerIndex].items[this.dragSourceCell.slotKey] = savedItem;
                } else {
                    console.warn("BG3 DragDrop | Unknown container type:", containerType, "- skipping update");
                }
                hasUpdate = true;
    
                await this.dragSourceCell._renderInner();    
                this.dragSourceCell = null;
            } else {
                // Construct Item
                // Parse the transferred data
                let dragData;
                try {
                    dragData = JSON.parse(event.dataTransfer.getData("text/plain"));
                    if(dragData.uuid) {
                        // Prevent cross-actor item placement
                        const splitUUID = dragData.uuid.split('.');
                        if(splitUUID.indexOf('Actor') > -1) {
                            const actorUUID = splitUUID.slice(0,splitUUID.indexOf('Actor') + 2).join('.');
                            if(actorUUID && actorUUID !== ui.BG3HOTBAR.manager.actor.uuid) {
                                ui.notifications.warn("You cannot add items from other characters.");
                                return;
                            }
                        }
                        // Check for duplicates if not allowed for this container
                        if(target._parent.data.allowDuplicate !== true && await this._isDuplicate(dragData.uuid)) {
                            ui.notifications.warn("This item is already on the hotbar.");
                            return;
                        }
                        newItem = {uuid: dragData.uuid};
                        hasUpdate = true;
                    }
                } catch (err) {
                    console.error("Failed to parse drop data:", err);
                    return;
                }
            }
            if(newItem) {
                // Handle 2 Handed weapon specific case (only for main containers, not temp containers)
                if(target._parent.id === 'weapon' && !ui.BG3HOTBAR.manager.tempContainers?.[target._parent.id]) {
                    const item = ui.BG3HOTBAR.manager.actor?.items?.get(newItem.uuid.split('.').pop());
                    if(target.slotKey === '0-0' && ui.BG3HOTBAR.manager.containers[target._parent.id][target._parent.index].items['1-0']) {
                        if(item && item?.labels?.properties?.find(p => p.abbr === 'two')) {
                            delete ui.BG3HOTBAR.manager.containers[target._parent.id][target._parent.index].items['1-0'];
                            await target._parent.components[1]._renderInner();
                        }
                    } else if(target.slotKey === '1-0' && item && item?.labels?.properties?.find(p => p.abbr === 'two')) {
                        ui.notifications.warn('You can\'t assign a 2-handed weapon to an offhand slot.')
                        return;
                    }
                }

                target.data.item = newItem;
    
                // Update manager stored data
                const targetContainerType = target._parent.id;
                const targetContainerIndex = target._parent.index;
                
                // Safety check for null targetContainerType
                if (!targetContainerType) {
                    console.warn("BG3 DragDrop | Target container type is null, skipping update");
                    return;
                }
                
                // Handle both regular containers and container popovers  
                if (targetContainerType.startsWith('container_')) {
                    // Container popover - update the GridContainer data directly
                    const popover = ContainerPopover.activePopover;
                    if (popover && popover.gridContainer) {
                        popover.gridContainer.data.items[target.slotKey] = newItem;
                    }
                } else if (ui.BG3HOTBAR.manager.containers?.[targetContainerType]?.[targetContainerIndex]) {
                    // Regular containers (hotbar, weapon, combat)
                    ui.BG3HOTBAR.manager.containers[targetContainerType][targetContainerIndex].items[target.slotKey] = newItem;
                } else {
                    console.warn("BG3 DragDrop | Unknown target container type:", targetContainerType, "- skipping update");
                }
                hasUpdate = true;

                await target._renderInner();
            }
        } catch (error) {
            console.error("Error during drop process:", error);
            ui.notifications.error("Failed to process drop");
            this.dragSourceCell = null;
        }
        // Handle persistence based on container type
        if(hasUpdate) {
            if (this._isTemporaryContainer(target)) {
                // Save container popover layout to parent hotbar item
                const popover = ContainerPopover.activePopover;
                if (popover) {
                    await popover.saveContainerLayout(popover.gridContainer.data.items);
                }
            } else {
                // Regular hotbar persistence
                await ui.BG3HOTBAR.manager.persist();
            }
        }

    }
}