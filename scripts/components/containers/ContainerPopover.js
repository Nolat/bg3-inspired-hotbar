// File: scripts/components/containers/ContainerPopover.js

import { BG3Component } from "../component.js";
import { GridContainer } from "./GridContainer.js";
import { fromUuid } from "../../utils/foundryUtils.js";
import { BG3CONFIG } from "../../utils/config.js";

/**
 * Container Popover component for displaying container contents in a grid layout
 * @extends BG3Component
 */
export class ContainerPopover extends BG3Component {
    constructor(containerItem, parentCell) {
        super();
        this.containerItem = containerItem;
        this.parentCell = parentCell;
        this.gridContainer = null;
    }

    get classes() {
        return ['bg3-container-popover'];
    }

    static isContainer(item) {
        return item && (item.type === 'container' || item.type === 'backpack');
    }

    /**
     * Gets the container key for flag storage based on parent cell position
     */
    getContainerKey() {
        const parentSlot = this.parentCell?.data?.slot || 
                          (this.parentCell?.data?.col !== undefined && this.parentCell?.data?.row !== undefined 
                           ? `${this.parentCell.data.col}-${this.parentCell.data.row}` 
                           : '0-0');
        return `container_${parentSlot}`;
    }

    /**
     * Loads container layout from parent hotbar item flags
     */
    loadContainerLayout() {
        // Get parent slot key - either from data.slot or calculated from col/row
        const parentSlotKey = this.parentCell?.data?.slot || 
                             (this.parentCell?.data?.col !== undefined && this.parentCell?.data?.row !== undefined 
                              ? `${this.parentCell.data.col}-${this.parentCell.data.row}` 
                              : null);
        
        if (!parentSlotKey) {
            return {};
        }
        
        // Find parent hotbar slot data in the containers structure
        let parentItemData = null;
        const hotbarContainers = ui.BG3HOTBAR?.manager?.containers?.hotbar || [];
        
        // Search through all hotbar containers to find the parent item
        for (const container of hotbarContainers) {
            if (container.items && container.items[parentSlotKey]) {
                parentItemData = container.items[parentSlotKey];
                break;
            }
        }
        
        
        
        return parentItemData?.containerLayout || {};
    }

    /**
     * Saves container layout to parent hotbar item flags
     */
    async saveContainerLayout(containerData) {
        // Sanitize layout: keep only entries with a valid uuid
        const sanitized = Object.entries(containerData || {})
            .reduce((acc, [slot, entry]) => {
                if (entry && typeof entry.uuid === 'string' && entry.uuid.length > 0) {
                    acc[slot] = { uuid: entry.uuid };
                }
                return acc;
            }, {});
        // Get parent slot key - either from data.slot or calculated from col/row
        const parentSlotKey = this.parentCell?.data?.slot || 
                             (this.parentCell?.data?.col !== undefined && this.parentCell?.data?.row !== undefined 
                              ? `${this.parentCell.data.col}-${this.parentCell.data.row}` 
                              : null);
        
        if (!parentSlotKey) {
            return;
        }
        // Find parent hotbar slot data in the containers structure
        let parentItemData = null;
        let parentContainer = null;
        const hotbarContainers = ui.BG3HOTBAR?.manager?.containers?.hotbar || [];
        
        // Search through all hotbar containers to find the parent item
        for (const container of hotbarContainers) {
            if (container.items && container.items[parentSlotKey]) {
                parentItemData = container.items[parentSlotKey];
                parentContainer = container;
                break;
            }
        }
        
        
        
        if (parentItemData && parentContainer) {
            // Update parent item data with container layout
            const updatedData = {
                ...parentItemData,
                containerLayout: sanitized
            };
            
            // Update the manager container data immediately
            parentContainer.items[parentSlotKey] = updatedData;
            
            // Save to flags via manager persist
            await ui.BG3HOTBAR.manager.persist();
            
        } else {
            console.warn("BG3 Container Popover | No parent item data found for slot:", parentSlotKey);
        }
    }

    /**
     * Sets up container drag-drop by registering temporary container
     */
    setupContainerDragDrop() {
        if (!ui.BG3HOTBAR?.manager?.tempContainers) {
            ui.BG3HOTBAR.manager.tempContainers = {};
        }
        ui.BG3HOTBAR.manager.tempContainers[this.getContainerKey()] = this;
    }

    /**
     * Handles persistence when items are dropped in popover
     */
    async persistContainerDrop(sourceSlot, targetSlot, item) {
        const savedLayout = this.loadContainerLayout();
        
        // Update source slot
        if (sourceSlot && savedLayout[sourceSlot]) {
            delete savedLayout[sourceSlot];
        }
        
        // Update target slot
        if (targetSlot && item) {
            savedLayout[targetSlot] = { uuid: item.uuid };
        }
        
        await this.saveContainerLayout(savedLayout);
    }

    async getContainerContents() {
        if (!this.containerItem || !ContainerPopover.isContainer(this.containerItem)) {
            return [];
        }

        try {
            let contents = [];
            if (this.containerItem.system?.contents) {
                contents = Array.from(this.containerItem.system.contents || []);
            } else if (this.containerItem.items) {
                contents = Array.from(this.containerItem.items || []);
            } else if (this.containerItem.contents) {
                contents = Array.from(this.containerItem.contents || []);
            }

            const itemPromises = contents.map(async (itemRef) => {
                try {
                    if (typeof itemRef === 'string') {
                        return await fromUuid(itemRef);
                    } else if (itemRef.uuid) {
                        return await fromUuid(itemRef.uuid);
                    } else if (itemRef._id || itemRef.id) {
                        return this.containerItem.actor?.items?.get(itemRef._id || itemRef.id);
                    }
                    return itemRef;
                } catch (error) {
                    console.warn("BG3 Container Popover | Error resolving item reference:", error);
                    return null;
                }
            });

            const resolvedItems = await Promise.all(itemPromises);
            return resolvedItems.filter(item => item !== null);
        } catch (error) {
            console.error("BG3 Container Popover | Error getting container contents:", error);
            return [];
        }
    }

    /**
     * Generates grid container data with saved layout integration
     */
    async getGridContainerData() {
        const savedContainerData = this.loadContainerLayout();
        // Sanitize saved data to avoid persisting/using null placeholders
        const sanitizedSaved = Object.entries(savedContainerData || {})
            .reduce((acc, [slot, entry]) => {
                if (entry && typeof entry.uuid === 'string' && entry.uuid.length > 0) {
                    acc[slot] = { uuid: entry.uuid };
                }
                return acc;
            }, {});
        
        // Always load contents to ensure we have items to display
        const contents = await this.getContainerContents();
        const contentUuidSet = new Set(contents.map(i => i?.uuid).filter(Boolean));

        const gridData = {
            id: this.getContainerKey(),
            index: 0,
            locked: false,
            allowDuplicate: true,
            cols: BG3CONFIG.INITIAL_COLS,
            rows: BG3CONFIG.ROWS,
            items: {}
        };

        // If we have saved layout, reconcile with actual container contents
        if (Object.keys(sanitizedSaved).length > 0) {
            const reconciled = Object.entries(sanitizedSaved)
                .reduce((acc, [slot, entry]) => {
                    if (contentUuidSet.has(entry.uuid)) acc[slot] = entry;
                    return acc;
                }, {});

            gridData.items = reconciled;

            // If reconciliation removed any entries, persist the cleaned layout
            if (Object.keys(reconciled).length !== Object.keys(sanitizedSaved).length) {
                await this.saveContainerLayout(reconciled);
            }
        } else if (contents.length > 0) {
            // Create default layout from contents
            contents.forEach((item, index) => {
                const row = Math.floor(index / gridData.cols);
                const col = index % gridData.cols;
                if (row < gridData.rows) {
                    const slotKey = `${col}-${row}`;
                    gridData.items[slotKey] = { uuid: item.uuid };
                }
            });
            
            // Save the default layout
            await this.saveContainerLayout(gridData.items);
        }

        return gridData;
    }

    /**
     * Inherits theming and settings from main hotbar
     */
    inheritTheming() {
        // Prefer the hotbar root, which hosts the theme CSS variables
        const hotbarRoot = document.querySelector('#bg3-hotbar-container');
        // Fallback to an existing hotbar grid if needed
        const hotbarGrid = hotbarRoot?.querySelector?.('.bg3-hotbar-subcontainer') ?? null;
        const themeSource = hotbarRoot || hotbarGrid;

        if (!themeSource || !this.element) return;



        // Copy CSS custom properties
        const computedStyle = getComputedStyle(themeSource);
        const cssVars = [
            '--bg3-hotbar-background-color',
            '--bg3-hotbar-border-color', 
            '--bg3-cell-border-width',
            '--bg3-hotbar-text-color',
            '--bg3-hotbar-cell-size',
            '--bg3-hotbar-sub-background-color',
            '--bg3-hotbar-border-color-hover',
            '--bg3-hotbar-background-color-hover',
            '--bg3-border-size',
            '--bg3-border-color',
            '--bg3-border-radius',
            '--bg3-hotbar-border-size',
            '--bg3-scale-ui'
        ];

        cssVars.forEach(varName => {
            const value = computedStyle.getPropertyValue(varName);
            if (value) {
                this.element.style.setProperty(varName, value);
            }
        });

        // Copy data attributes for item display from the hotbar root
        const dataAttrs = ['data-item-name', 'data-item-use'];
        dataAttrs.forEach(attr => {
            const value = hotbarRoot?.getAttribute?.(attr);
            if (value !== null && value !== undefined) {
                this.element.setAttribute(attr, value);
            }
        });



        // Ensure a valid cell size is present; if missing, fall back to the module default
        const cellSize = (this.element.style.getPropertyValue('--bg3-hotbar-cell-size') || computedStyle.getPropertyValue('--bg3-hotbar-cell-size') || '').trim();
        if (!cellSize) {
            const fallback = (BG3CONFIG?.BASE_THEME?.['--bg3-hotbar-cell-size']) || `${BG3CONFIG.CELL_SIZE}px`;
            this.element.style.setProperty('--bg3-hotbar-cell-size', fallback);
        }
    }

    setupEvents() {
        this.escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);

        this.outsideClickHandler = (e) => {
            if (!this.element.contains(e.target) && !this.parentCell.element.contains(e.target)) {
                this.close();
            }
        };
        document.addEventListener('click', this.outsideClickHandler);
    }

    positionPopover(triggerElement) {
        const rect = triggerElement.getBoundingClientRect();
        const popoverRect = this.element.getBoundingClientRect();
        const root = document.querySelector('#bg3-hotbar-container');

        // Center horizontally relative to trigger
        const triggerCenterX = rect.left + (rect.width / 2);

        let leftPx;
        let topPx;

        if (root && this.element.closest('#bg3-hotbar-container')) {
            // Compute relative to hotbar root and account for scale
            const rootRect = root.getBoundingClientRect();
            const rootComputed = getComputedStyle(root);
            const scaleVar = (rootComputed.getPropertyValue('--bg3-scale-ui') || '1').trim();
            const scale = Number(parseFloat(scaleVar)) || 1;

            // Calculate centered position relative to root
            const centeredLeftViewport = triggerCenterX - (popoverRect.width / 2) - rootRect.left;
            const topViewport = rect.top - 10 - popoverRect.height - rootRect.top;

            // Convert to root coordinate space
            const centeredLeftPx = centeredLeftViewport / scale;
            topPx = topViewport / scale;

            // Only clamp if it would go significantly outside bounds
            // Allow some overflow to maintain centering
            const rootWidthPx = rootRect.width / scale;
            const popoverWidthPx = popoverRect.width / scale;
            const maxAllowedLeft = rootWidthPx - popoverWidthPx + 20; // Allow 20px overflow
            const minAllowedLeft = -20; // Allow 20px overflow on left

            if (centeredLeftPx > maxAllowedLeft) {
                leftPx = maxAllowedLeft;
            } else if (centeredLeftPx < minAllowedLeft) {
                leftPx = minAllowedLeft;
            } else {
                leftPx = centeredLeftPx;
            }
        } else {
            // Fallback to viewport positioning
            leftPx = triggerCenterX - (popoverRect.width / 2);
            topPx = rect.top - 10 - popoverRect.height;

            // Minimal clamping for viewport
            if (leftPx + popoverRect.width > window.innerWidth - 10) {
                leftPx = window.innerWidth - popoverRect.width - 10;
            }
            if (leftPx < 10) leftPx = 10;
        }

        // Always keep 10px above the trigger; do not fall back below
        this.element.style.left = `${leftPx}px`;
        this.element.style.top = `${topPx}px`;
    }

    cleanup() {
        if (ui.BG3HOTBAR?.manager?.tempContainers) {
            delete ui.BG3HOTBAR.manager.tempContainers[this.getContainerKey()];
        }
    }

    close() {
        if (this.element) {
            this.cleanup();

            if (this.escapeHandler) {
                document.removeEventListener('keydown', this.escapeHandler);
            }
            if (this.outsideClickHandler) {
                document.removeEventListener('click', this.outsideClickHandler);
            }

            // Remove immediately with no delay
            if (this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
        }
        if (ContainerPopover.activePopover === this) ContainerPopover.activePopover = null;
    }

    async show(triggerElement) {
        // Toggle behavior: if same container is open, close it and return
        if (ContainerPopover.activePopover && ContainerPopover.activePopover.containerItem === this.containerItem) {
            ContainerPopover.activePopover.close();
            return ContainerPopover.activePopover;
        }
        // If a different popover is open, close it first
        if (ContainerPopover.activePopover && ContainerPopover.activePopover !== this) {
            ContainerPopover.activePopover.close();
        }
        await this.render();
        const root = document.querySelector('#bg3-hotbar-container');
        if (root) {
            this.element.classList.add('positioned');
            root.appendChild(this.element);
        } else {
            document.body.appendChild(this.element);
        }
        this.inheritTheming();
        
        // Position after element is in DOM and has proper dimensions and scaling
        requestAnimationFrame(() => {
            this.element.classList.add('show');
            // Wait one more frame so CSS transforms (scale) are applied before measuring
            requestAnimationFrame(() => this.positionPopover(triggerElement));
        });
        
        this.setupEvents();

        ContainerPopover.activePopover = this;
        return this;
    }

    async render() {
        // Get grid data and create GridContainer
        const gridData = await this.getGridContainerData();

        
        this.gridContainer = new GridContainer(gridData, this);
        
        // Set properties explicitly after creation
        this.gridContainer.id = gridData.id;
        this.gridContainer.index = gridData.index;
        
        // Setup drag-drop
        this.setupContainerDragDrop();
        
        // Override menu actions for container-specific behavior
        const originalMenuItemAction = this.gridContainer.menuItemAction;
        this.gridContainer.menuItemAction = async (action) => {
            if (action === 'clear') {
                await this.saveContainerLayout({});
                this.gridContainer.data.items = {};
                this.gridContainer.render();
            } else if (action === 'sort') {
                // Call original sort action first
                await originalMenuItemAction.call(this.gridContainer, action);
                // Then save the sorted layout to container
                await this.saveContainerLayout(this.gridContainer.data.items);
            } else {
                return originalMenuItemAction.call(this.gridContainer, action);
            }
        };

        // Render grid container and use it as our main element

        await this.gridContainer.render();
        this.element = this.gridContainer.element;
        

        
        // Add popover-specific classes
        this.element.classList.add(...this.classes);








        return this.element;
    }


}
