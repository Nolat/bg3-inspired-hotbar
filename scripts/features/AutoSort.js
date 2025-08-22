// Auto Sort Feature
// Handles sorting items in containers

import { fromUuid } from '../utils/foundryUtils.js';

export class AutoSort {
    static async sortContainer(container) {
        if (!container?.data?.items) return;

        try {
            // Convert items object to array for sorting
            const items = [];
            
            // First pass: collect only valid items (with a real uuid)
            for (const [key, rawItem] of Object.entries(container.data.items)) {
                if (!rawItem || !rawItem.uuid || typeof rawItem.uuid !== "string") continue;
                items.push({
                    key,
                    ...rawItem,
                    sortData: null // We'll populate this with fresh data
                });
            }
            
            // Second pass: fetch fresh data for each item
            for (const item of items) {
                try {
                    if (!item.uuid) continue;
                    const itemData = await fromUuid(item.uuid);
                    if (itemData) {
                        // Ensure base fields are populated from the source document
                        item.type = itemData.type;
                        item.name = itemData.name;
                        item.sortData = {
                            spellLevel: itemData.type === "spell" ? (itemData.system?.level ?? 0) : 99,
                            featureType: itemData.type === "feat" ? itemData.system?.type?.value ?? "" : "",
                            name: itemData.name
                        };
                    } else {
                        // Fallback to stored sortData if we can't fetch fresh data
                        item.sortData = item.sortData || {
                            spellLevel: 99,
                            featureType: "",
                            name: item.name
                        };
                    }
                } catch (error) {
                    console.warn(`Failed to fetch fresh data for item ${item.name}:`, error);
                    // Use stored sortData as fallback
                    item.sortData = item.sortData || {
                        spellLevel: 99,
                        featureType: "",
                        name: item.name
                    };
                }
            }

            // Sort items using unified priority ordering
            this._sortItems(items);

            // Clear container
            container.data.items = {};

            // Re-add items in sorted order
            let r = 0;
            let c = 0;
            const cols = container.data.cols || 5;
            const rows = container.data.rows || 3;

            for (const item of items) {
                // Stop if we've run out of grid space
                if (r >= rows) break;
                
                const slotKey = `${c}-${r}`;
                if (item.uuid) {
                    container.data.items[slotKey] = {
                        uuid: item.uuid,
                        // Keep any additional data that might exist
                        ...(item.sortData && { sortData: item.sortData })
                    };
                }

                // Move to next position
                c++;
                if (c >= cols) {
                    c = 0;
                    r++;
                }
            }

            // Render container and persist changes
            if (container.render) {
                container.render();
            }
            
            // Only persist for regular containers, not container popovers
            // (Container popovers handle their own persistence via ContainerPopover.saveContainerLayout)
            if (!container.id?.startsWith('container_') && ui.BG3HOTBAR?.manager?.persist) {
                await ui.BG3HOTBAR.manager.persist();
            }

            ui.notifications.info("Container sorted successfully.");
        } catch (error) {
            console.error("Error sorting container:", error);
            ui.notifications.error("Failed to sort container. See console for details.");
        }
    }

    static _sortItems(items) {
        // Define type order (first to last)
        // Required: weapons > features > equipment > spells > consumables > tools (others last)
        const typeOrder = ["weapon", "feat", "equipment", "spell", "consumable", "tool", "loot"];
        
        items.sort((a, b) => {
            // First, sort by item type according to our defined order
            const typeIndexA = typeOrder.indexOf(a.type);
            const typeIndexB = typeOrder.indexOf(b.type);
            
            // Handle different type priorities
            if (typeIndexA !== typeIndexB) {
                if (typeIndexA === -1) return 1;  // Unknown types go to the end
                if (typeIndexB === -1) return -1;
                return typeIndexA - typeIndexB;
            }
            
            // Then apply type-specific sorting
            switch (a.type) {
                case "spell":
                    // Sort by spell level first (cantrips = 0, then 1-9)
                    const levelA = a.sortData?.spellLevel ?? 99;
                    const levelB = b.sortData?.spellLevel ?? 99;
                    if (levelA !== levelB) {
                        return levelA - levelB;
                    }
                    // If same level, sort alphabetically
                    return (a.name || a.sortData?.name || "").localeCompare(b.name || b.sortData?.name || "");

                case "feat":
                    // Sort by feature type first
                    const typeA = a.sortData?.featureType || "";
                    const typeB = b.sortData?.featureType || "";
                    const typeCompare = typeA.localeCompare(typeB);
                    if (typeCompare !== 0) {
                        return typeCompare;
                    }
                    // If same type, sort alphabetically
                    return (a.name || a.sortData?.name || "").localeCompare(b.name || b.sortData?.name || "");

                default:
                    // All other items sort alphabetically within their type
                    return (a.name || a.sortData?.name || "").localeCompare(b.name || b.sortData?.name || "");
            }
        });
    }

    static _sortItemsByName(items) {
        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    /**
     * Enrich a list of uuid entries with type/name/sortData and return a new sorted array.
     * Accepts either array of strings (uuids) or objects containing { uuid }.
     * Returns minimal entries { uuid } in sorted order for container placement.
     * @param {Array<string|{uuid:string}>} entries
     * @returns {Promise<Array<{uuid:string}>>}
     */
    static async sortUuidEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) return [];

        // Normalize to array of { uuid }
        const normalized = entries
            .map((e) => (typeof e === 'string' ? { uuid: e } : e))
            .filter((e) => e && typeof e.uuid === 'string' && e.uuid.length > 0);

        // Fetch docs and build sortable items
        const enriched = [];
        for (const entry of normalized) {
            try {
                const itemData = await fromUuid(entry.uuid);
                if (!itemData) {
                    // Keep placeholder with best-effort defaults
                    enriched.push({ ...entry, type: undefined, name: undefined, sortData: undefined });
                    continue;
                }
                const type = itemData.type;
                const name = itemData.name;
                const sortData = {
                    spellLevel: type === 'spell' ? (itemData.system?.level ?? 0) : 99,
                    featureType: type === 'feat' ? (itemData.system?.type?.value ?? '') : '',
                    name
                };
                enriched.push({ ...entry, type, name, sortData });
            } catch (err) {
                // Fallback entry on fetch failure
                enriched.push({ ...entry, type: undefined, name: undefined, sortData: undefined });
            }
        }

        // Sort in place
        this._sortItems(enriched);

        // Return minimal objects in sorted order
        return enriched.map((e) => ({ uuid: e.uuid }));
    }
}