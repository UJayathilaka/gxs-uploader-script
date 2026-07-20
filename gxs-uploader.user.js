// ==UserScript==
// @name         Image Mapping + Batch Upload & Row Opener (UX Optimized)
// @namespace    http://tampermonkey.net/
// @version      8.5
// @description  Fully English translated, fixed bottom UI, Auto Sort, Instant Stop, Strict Dropdown Selection, Instant Image Upload Verification & Safe Saving
// @author       UJay (Premium Batch Edition)
// @match        *://demo.pdb.graphxserver.io/*
// @match        *://*.pdb.graphxserver.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const LOG = (msg) => console.log('%c[AutoMate] ' + msg, 'color:#D4AF37;font-weight:bold;');

    // Custom Error for Instant Stopping
    class BatchStopError extends Error { constructor() { super('Stopped'); this.name = 'BatchStopError'; } }
    let batchStopRequested = false;

    // Advanced wait function that checks for instant stop every 50ms
    function wait(ms) {
        return new Promise((resolve, reject) => {
            if (batchStopRequested) return reject(new BatchStopError());
            let waited = 0;
            const step = 50;
            const interval = setInterval(() => {
                if (batchStopRequested) {
                    clearInterval(interval);
                    return reject(new BatchStopError());
                }
                waited += step;
                if (waited >= ms) {
                    clearInterval(interval);
                    resolve();
                }
            }, step);
        });
    }

    let fileQueue = [];
    let sortStagingQueue = [];

    // Invisible Click Blocker to prevent focus loss during batch
    function toggleClickBlocker(enable) {
        let blocker = document.getElementById('gxs-click-blocker');
        if (!blocker) {
            blocker = document.createElement('div');
            blocker.id = 'gxs-click-blocker';
            blocker.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:99999997; display:none;';
            document.body.appendChild(blocker);
            blocker.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); }, true);
            blocker.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); }, true);
        }
        blocker.style.display = enable ? 'block' : 'none';
    }

    function getActiveQueueArray() {
        const activeTab = document.querySelector('.gxs-tab.active');
        const isAutosort = activeTab ? activeTab.dataset.tab === 'autosort' : false;
        return isAutosort ? sortStagingQueue : fileQueue;
    }

    function setNativeValue(element, value) {
        const lastValue = element.value;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (nativeSetter) { nativeSetter.call(element, value); } else { element.value = value; }
        const tracker = element._valueTracker;
        if (tracker) { tracker.setValue(lastValue); }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function findCustomImageTab() {
        let tab = document.querySelector('button.sc-gEGRof.gKGdjh.tabs');
        const allTabs = document.querySelectorAll('button.sc-gEGRof.tabs, button.tabs, button[class*="tabs"]');
        for (const t of allTabs) { if ((t.textContent || '').trim() === 'Custom Image') return t; }
        return Array.from(document.querySelectorAll('button')).find(btn => (btn.textContent || '').trim() === 'Custom Image');
    }

    async function clickCustomImageTab(setStatus) {
        setStatus('1. Custom Image tab...');
        let tab = null;
        for (let i = 0; i < 15; i++) { tab = findCustomImageTab(); if (tab) break; await wait(50); }
        if (!tab) { setStatus('⚠️ Custom Image tab not found'); return false; }
        tab.scrollIntoView({ block: 'center', behavior: 'instant' }); await wait(50);
        tab.click(); tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(200);

        for (let i = 0; i < 20; i++) {
            const zone = findDragZone();
            if (zone && zone.offsetParent !== null) return true;
            await wait(100);
        }
        return true;
    }

    function findDragZone() { return document.querySelector('.dragZone') || document.querySelector('[class*="dragZone"]'); }

    async function dropFileIntoZone(file, setStatus) {
        setStatus('1. Dragging & dropping image...');
        let zone = null;
        for (let i = 0; i < 20; i++) { zone = findDragZone(); if (zone) break; await wait(100); }
        if (!zone) { setStatus('❌ Drop Zone not found!'); return false; }

        zone.scrollIntoView({ block: 'center', behavior: 'instant' }); await wait(100);
        const dataTransfer = new DataTransfer(); dataTransfer.items.add(file);

        try {
            zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer })); await wait(50);
            zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })); await wait(50);
            zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })); await wait(300);
        } catch (e) { setStatus('⚠️ Drag event dispatch failed - trying fallback...'); }

        const fileInput = zone.querySelector('input[type="file"]');
        if (fileInput) { try { Object.defineProperty(fileInput, 'files', { value: dataTransfer.files, writable: false }); fileInput.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} }

        setStatus('✅ Image dropped: ' + file.name); await wait(400); return true;
    }

    async function awaitRowEnlargeReady(rowIndex, setStatus) {
        setStatus(`⏳ Waiting for Row ${rowIndex} to refresh...`);
        for (let attempt = 0; attempt < 30; attempt++) {
            const tableRows = document.querySelectorAll('.sc-dPYEIF');
            for (let tableRow of tableRows) {
                const indexSpan = tableRow.querySelector('.rowIndex');
                if (indexSpan && indexSpan.textContent.trim() === String(rowIndex)) {
                    const enlargeBtn = tableRow.querySelector('.rowEnlarge');
                    if (enlargeBtn && enlargeBtn.offsetParent !== null) return true;
                }
            }
            await wait(150);
        }
        setStatus(`⚠️ Could not verify Row ${rowIndex} refresh - continuing...`);
        return false;
    }

    async function openRowAndAwaitModal(rowIndex, setStatus) {
        await ensureNoModalOpen(setStatus);
        setStatus(`⏳ Looking for Row ${rowIndex}...`);
        let enlargeBtn = null; const maxRowSearchAttempts = 20;
        for (let attempt = 0; attempt < maxRowSearchAttempts; attempt++) {
            const tableRows = document.querySelectorAll('.sc-dPYEIF');
            for (let tableRow of tableRows) {
                const indexSpan = tableRow.querySelector('.rowIndex');
                if (indexSpan && indexSpan.textContent.trim() === String(rowIndex)) { const foundBtn = tableRow.querySelector('.rowEnlarge'); if (foundBtn) { enlargeBtn = foundBtn; break; } }
            }
            if (enlargeBtn) break; await wait(150);
        }
        if (!enlargeBtn) return false;
        enlargeBtn.click(); const innerDiv = enlargeBtn.querySelector('div'); if (innerDiv) innerDiv.click();
        setStatus(`⏳ Waiting for Row ${rowIndex} to load...`);
        for(let i=0; i<40; i++){ const nameInput = findViewNameInput(); if(nameInput && nameInput.offsetParent !== null) return true; await wait(100); }
        return false;
    }

    async function openAddViewAndAwaitModal(setStatus) {
        await ensureNoModalOpen(setStatus);
        if (isAddViewModalOpen()) return true;
        const addBtn = findAddNewViewButton();
        if(addBtn) {
            addBtn.click(); setStatus(`⏳ Waiting for Add View to load...`);
            for(let i=0; i<40; i++){ if(isAddViewModalOpen()) return true; await wait(100); }
        }
        return false;
    }

    // SAFETY LOCK
    async function ensureNoModalOpen(setStatus) {
        const isOpen = () => {
            const nameInput = findViewNameInput();
            return (nameInput && nameInput.offsetParent !== null) || isAddViewModalOpen();
        };
        if (!isOpen()) return true;

        setStatus('🔒 Previous modal still open - closing it first...');
        for (let attempt = 0; attempt < 5 && isOpen(); attempt++) {
            const cancelBtn = findCancelButton();
            if (cancelBtn) {
                cancelBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
                await wait(100);
                cancelBtn.click();
                cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            } else {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            }
            await wait(500);
        }

        for (let i = 0; i < 20; i++) {
            if (!isOpen()) { await wait(500); return true; }
            await wait(150);
        }

        setStatus('⚠️ Could not confirm previous modal closed - proceeding cautiously...');
        await wait(500);
        return false;
    }

    async function awaitModalClose(setStatus) {
        setStatus('⏳ Waiting for the window to close...');
        for(let i=0; i<60; i++){
            const nameInput = findViewNameInput();
            if(!nameInput || nameInput.offsetParent === null) {
                await wait(500);
                const recheck = findViewNameInput();
                if (!recheck || recheck.offsetParent === null) {
                    await wait(300);
                    return true;
                }
            }
            await wait(100);
        }
        return false;
    }

    function findAddNewViewButton() {
        const paths = document.querySelectorAll('svg path');
        for (const p of paths) { const d = p.getAttribute('d') || ''; if (d.includes('21.75') && d.includes('16.8744')) return p.closest('button, div[role="button"], div.sc-bXJUHT, div'); }
        return null;
    }

    // STRICT DROPDOWN SELECTION
    async function selectAutocompleteOption(input, value, setStatus){
        input.focus(); input.click(); setNativeValue(input, ""); await wait(50);
        let typed = "";
        for(const ch of value){
            typed += ch; input.dispatchEvent(new KeyboardEvent("keydown",{key:ch,bubbles:true})); setNativeValue(input, typed); input.dispatchEvent(new KeyboardEvent("keyup",{key:ch,bubbles:true})); await wait(50);
        }
        await wait(800);
        let option = null;
        for(let i=0; i<40; i++){
            const options = [...document.querySelectorAll('li[role="option"]'),...document.querySelectorAll('.MuiAutocomplete-option')];
            option = options.find(o=>{ return (o.textContent||'').trim().toLowerCase()===value.toLowerCase(); });
            if(option) break;
            await wait(100);
        }
        if(option){
            option.scrollIntoView({block:"nearest"}); await wait(100);
            option.dispatchEvent(new MouseEvent("mousemove",{bubbles:true}));
            option.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
            option.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));
            option.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));
            option.click();
            await wait(400);
            return true;
        }
        return false;
    }

    function isAddViewModalOpen() {
        const h4s = Array.from(document.querySelectorAll('h4'));
        const found = h4s.find(h4 => { const txt = (h4.textContent || '').trim().toLowerCase(); if (!(txt === 'add new view' || txt.includes('add new view') || txt.includes('add view'))) return false; return h4.offsetParent !== null || h4.getClientRects().length > 0; });
        if (found) return true;
        const nameInputFallback = findViewNameInput(); if (nameInputFallback && nameInputFallback.offsetParent !== null) return true; return false;
    }

    function findViewNameInput() { return document.querySelector('input[placeholder="View Name"]') || document.querySelector('input[name="title"]') || document.querySelector('input.MuiFilledInput-input:not(.MuiAutocomplete-input)') || document.querySelector('input.MuiInputBase-input:not(.MuiAutocomplete-input)'); }
    function findAutoCodeCheckbox() { return document.querySelector('#autoCode') || document.querySelector('input[name="autoCode"]') || document.querySelector('label[for="autoCode"] input'); }
    function findUpperSupplierColorInput() {
        const labels = Array.from(document.querySelectorAll('label, div, span, p'));
        for (const label of labels) {
            const txt = (label.textContent || '').trim();
            if (txt === 'Supplier Color' || txt.startsWith('Supplier Color')) {
                let container = label.closest('.MuiFormControl-root,.MuiAutocomplete-root,.sc-wrmaB,.sc-bIiiAW, div') || label.parentElement;
                if (container) { const inp = container.querySelector('input.MuiAutocomplete-input, input.MuiInputBase-inputAdornedEnd, input[role="combobox"], input'); if (inp && !inp.closest('#filterBar') && !inp.closest('[class*="filter"]') && !inp.closest('table')) return inp; }
            }
        }
        let inp = document.querySelector('input.MuiInputBase-input.MuiFilledInput-input.MuiInputBase-inputAdornedEnd.MuiAutocomplete-input'); if (inp && !inp.closest('#filterBar')) return inp;
        inp = document.querySelector('input.MuiAutocomplete-input.MuiInputBase-inputAdornedEnd'); if (inp && !inp.closest('#filterBar')) return inp;
        return document.querySelector('input.MuiAutocomplete-input:not([id*="filter"])') || document.querySelector('input[role="combobox"].MuiAutocomplete-input') || document.querySelector('input.sc-ilEflY') || document.querySelector('input.JXxPK');
    }
    function findProductPartsTab() {
        let tab = document.querySelector('button.sc-gEGRof.gKGdjh.tabs'); if (tab && tab.textContent.trim() === 'Product Parts') return tab;
        tab = Array.from(document.querySelectorAll('button.sc-gEGRof.tabs, button.tabs, button[class*="tabs"]')).find(btn => btn.textContent.trim() === 'Product Parts'); if (tab) return tab;
        tab = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Product Parts'); if (tab) return tab;
        return Array.from(document.querySelectorAll('button, div[role="tab"], [class*="tab"]')).find(el => (el.textContent || '').trim() === 'Product Parts');
    }

    function detectCategory(name) {
        const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (n.includes('3quarter') || n.includes('3q') || n.includes('threequarter') || n.includes('3quarters')) return { text: '3Quarters (3Q)', value: '2' };
        if (n.includes('front') || n.includes('fr')) return { text: 'Front (FR)', value: '1' };
        if (n.includes('back') || n.includes('bk')) return { text: 'Back (BK)', value: '3' };
        if (n.includes('left') || n.includes('ls') || n.includes('leftside')) return { text: 'LeftSide (LS)', value: '4' };
        if (n.includes('right') || n.includes('rs') || n.includes('rightside')) return { text: 'RightSide (RS)', value: '5' };
        if (n.includes('top') || n.includes('tp')) return { text: 'Top (TP)', value: '6' }; return null;
    }

    function extractColor(name) {
        const parts = name.split(/--|-|_/).map(p => p.trim()).filter(Boolean);
        const views = ['front','back','3quarters','3q','leftside','rightside','top','fr','bk','ls','rs','tp','left','right','model'];
        let viewIndex = -1;
        for (let i = 0; i < parts.length; i++) { const lower = parts[i].toLowerCase(); if (views.some(v => lower.includes(v))) { viewIndex = i; break; } }
        if (viewIndex > 0) { const colorCandidate = parts[viewIndex - 1]; if (!/^\d+$/.test(colorCandidate) && !/^[a-z]?\d+$/i.test(colorCandidate) && colorCandidate.length > 1) return colorCandidate.toUpperCase(); }
        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i]; const lower = p.toLowerCase();
            if (views.some(v => lower.includes(v))) continue; if (/^\d+$/.test(p)) continue; if (/^[a-z]?\d+$/i.test(p)) continue; if (p.length < 2) continue; if (lower === 'model') continue; return p.toUpperCase();
        } return null;
    }

    function buildShortLabel(fileName) {
        const name = fileName.replace(/\.[^/.]+$/, "").trim(); const parts = name.split('--').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 4) return `${parts[2]} - ${parts[3]}`; if (parts.length === 3) return `${parts[1]} - ${parts[2]}`;
        const color = extractColor(name); const category = detectCategory(name);
        if (color && category) return `${color} - ${category.text.split(' (')[0]}`; if (color) return color; return name;
    }

    function findCategoryTrigger() {
        const labels = Array.from(document.querySelectorAll('label, div, span, p'));
        for (const label of labels) {
            const txt = (label.textContent || '').trim().toLowerCase();
            if (txt === 'category' || txt.startsWith('category')) {
                let container = label.closest('.MuiFormControl-root, div') || label.parentElement;
                if (container) { const trig = container.querySelector('div[role="combobox"].MuiSelect-select, div.MuiSelect-select[role="combobox"]'); if (trig) return trig; }
            }
        }
        return document.querySelector('div[role="combobox"].MuiSelect-select') || document.querySelector('div.MuiSelect-select[role="combobox"]') || document.querySelector('div[role="combobox"][aria-haspopup="listbox"]') || document.querySelector('.MuiSelect-select.MuiSelect-filled');
    }

    async function selectViewCategory(category, setStatus) {
        if (!category) return; setStatus('4. ' + category.text + '...');
        for (let retry = 0; retry < 3; retry++) {
            let trigger = null; for (let i = 0; i < 20; i++) { trigger = findCategoryTrigger(); if (trigger) break; await wait(50); }
            if (!trigger) { await wait(150); continue; }
            trigger.scrollIntoView({ block: 'center' }); await wait(50); trigger.focus(); trigger.click(); trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await wait(150);
            let menuItem = null;
            for (let attempt = 0; attempt < 20; attempt++) {
                const listbox = document.querySelector('ul[role="listbox"],.MuiMenu-list,.MuiPopover-paper ul'); const items = listbox ? listbox.querySelectorAll('li[role="option"],.MuiMenuItem-root') : document.querySelectorAll('li[role="option"],.MuiMenuItem-root');
                for (const item of items) {
                    const text = (item.textContent || '').trim(); const dataValue = item.getAttribute('data-value');
                    if (dataValue === category.value || text === category.text || (category.value === '2' && text.includes('3Quarters')) || (category.value === '1' && text.includes('Front (FR)')) || (category.value === '3' && text.includes('Back (BK)')) || (category.value === '4' && text.includes('LeftSide')) || (category.value === '5' && text.includes('RightSide')) || (category.value === '6' && text.includes('Top (TP)'))) { menuItem = item; break; }
                }
                if (menuItem) break; await wait(50);
            }
            if (!menuItem) { document.body.click(); await wait(150); continue; }
            menuItem.scrollIntoView({ block: 'nearest' }); menuItem.click(); menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(200);
            const trigNow = findCategoryTrigger(); const trigText = trigNow ? (trigNow.textContent || '').trim() : ''; const shortCode = category.text.match(/\(([^)]+)\)/)?.[1] || '';
            if (trigText === category.text || (shortCode && trigText.includes(shortCode)) || trigText.includes(category.text.split(' ')[0])) { setStatus('✅ ' + category.text); return; }
        }
        setStatus('❌ Category failed - check manually');
    }

    async function fillUpperSupplierColor(color, setStatus) {
        let isEmptyMode = false; if (!color) { isEmptyMode = true; color = ""; } else { color = color.toLowerCase().trim(); }
        if (isEmptyMode) { setStatus('5. Clear default...'); } else { setStatus('5. Upper Color: ' + color + '...'); }
        let colorInput = null; for (let i = 0; i < 15; i++) { colorInput = findUpperSupplierColorInput(); if (colorInput) break; await wait(50); }
        if (!colorInput) { setStatus('❌ Upper Color missing'); return false; }

        colorInput.scrollIntoView({ block: 'center', behavior: 'instant' }); await wait(100); colorInput.focus(); colorInput.click(); await wait(100);

        const popupBtn = colorInput.closest(".MuiAutocomplete-root")?.querySelector(".MuiAutocomplete-popupIndicator"); if (popupBtn) { popupBtn.click(); await wait(200); }
        try { const root = colorInput.closest('.MuiAutocomplete-root,.MuiFormControl-root'); if (root) { const clearBtn = root.querySelector('.MuiAutocomplete-clearIndicator, button[aria-label="Clear"], button.MuiAutocomplete-clearIndicator'); if (clearBtn) { clearBtn.click(); await wait(100); } } } catch(e) {}

        setNativeValue(colorInput, ''); colorInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); colorInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true })); await wait(100);
        if (isEmptyMode) { colorInput.blur(); return true; }

        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) setStatus(`⚠️ Retrying dropdown (${attempt+1})...`);
            success = await selectAutocompleteOption(colorInput, color, setStatus);
            if (success) {
                await wait(300);
                const final = findUpperSupplierColorInput();
                if (final && final.value.toLowerCase() === color) {
                     break;
                } else {
                     success = false;
                }
            }
        }

        if (!success) {
            setStatus('❌ Dropdown selection failed.');
        } else {
            setStatus('✅ Upper Color Selected via Dropdown');
        }

        await wait(300);
        return success;
    }

    async function doFilterSteps(color, setStatus) {
        if (color) color = color.toLowerCase().trim(); setStatus('7.0 Clear filters...');
        for (let t = 0; t < 10; t++) {
            let removed = false; const deleteIcons = document.querySelectorAll('#filterBar .MuiChip-deleteIcon, #filterBar [class*="chip"] svg, #filterBar button[aria-label*="delete" i], #filterBar button[aria-label*="Delete" i], [id="filterBar"] svg, div[class*="Chip"] svg, div[class*="chip"] button');
            for (const icon of deleteIcons) { const chipText = (icon.closest('div,button,span')?.textContent || '').toUpperCase(); if (chipText.length > 0) { try { (icon.closest('button') || icon).click(); removed = true; await wait(50); } catch(e) {} } }
            if (!removed) break; await wait(50);
        }
        await wait(50); if (!color) return; setStatus('7.1 Open filter...');
        let filterInput = null;
        for (let i = 0; i < 15; i++) { filterInput = document.querySelector('div.sc-dCXpyg input') || document.querySelector('#filterBar input') || document.querySelector('[id="filterBar"] input') || document.querySelector('div[class*="dCXpyg"] input') || document.querySelector('input[placeholder*="Search" i]') || document.querySelector('input[placeholder*="Filter" i]') || document.querySelector('input[placeholder*="Type To Search" i]'); if (filterInput) break; await wait(50); }
        if (!filterInput) return;
        filterInput.scrollIntoView({ block: 'center' }); filterInput.focus(); setNativeValue(filterInput, ''); filterInput.value = ''; filterInput.dispatchEvent(new Event('input', { bubbles: true })); await wait(20); filterInput.click(); filterInput.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(100);

        let portal1 = null; for (let i = 0; i < 12; i++) { portal1 = document.querySelector('#portal > div:nth-of-type(3) > div div:nth-of-type(2) > div > div') || document.querySelector('#portal > div:nth-of-type(3) > div > div:nth-of-type(2) > div > div') || document.querySelector('#portal div:nth-of-type(3) div div:nth-of-type(2) div div'); if (portal1) break; await wait(50); }
        if (portal1) { portal1.click(); portal1.dispatchEvent(new MouseEvent('click', { bubbles: true })); } await wait(150);

        let supplierOpt = null; for (let i = 0; i < 14; i++) { supplierOpt = document.querySelector('div.sc-hQzLxD') || document.querySelector('div.sc-hQzLxD.hneGsc') || document.querySelector('div[class*="hQzLxD"]') || Array.from(document.querySelectorAll('div, li, span, button')).find(el => { const t = (el.textContent || '').trim(); return t === 'Supplier Color' || t === 'Supplier Color ='; }); if (supplierOpt) break; await wait(50); }
        if (supplierOpt) { supplierOpt.scrollIntoView({ block: 'nearest' }); supplierOpt.click(); supplierOpt.dispatchEvent(new MouseEvent('click', { bubbles: true })); } await wait(150);

        setStatus('7.4 Type ' + color + '...'); let valueInput = null; for (let i = 0; i < 10; i++) { valueInput = document.querySelector('#portal input:focus') || document.querySelector('#portal .MuiAutocomplete-input') || document.querySelector('#portal input[role="combobox"]') || document.querySelector('#portal input'); if (valueInput) break; await wait(50); }
        if (valueInput && color) {
            valueInput.focus(); valueInput.click(); setNativeValue(valueInput, ''); await wait(50); let typed = "";
            for (const char of color) { typed += char; valueInput.dispatchEvent(new KeyboardEvent("keydown",{key:char,bubbles:true})); setNativeValue(valueInput, typed); valueInput.dispatchEvent(new KeyboardEvent("keyup",{key:char,bubbles:true})); await wait(20); }
            await wait(400); let matched = null;
            for (let a = 0; a < 20; a++) {
                const items = document.querySelectorAll('li[role="option"],.MuiAutocomplete-option, li.MuiMenuItem-root, [role="option"],.MuiMenu-list li');
                for (const item of items) { const t = (item.textContent || '').trim().toLowerCase(); if (t === color) { matched = item; break; } }
                if (!matched) { for (const item of items) { const t = (item.textContent || '').trim().toLowerCase(); if (t.startsWith(color) || t.includes(color)) { matched = item; break; } } }
                if (matched) break; await wait(30);
            }
            if (matched) { matched.scrollIntoView({ block: 'nearest' }); matched.click(); matched.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); matched.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); matched.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(50);
            } else { valueInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, code: 'Enter' })); await wait(100); }
            valueInput.blur(); await wait(50);
        } await wait(100);
    }

    async function waitForDynamicLoad(setStatus) {
        setStatus('8. Waiting for rows...'); await wait(800);
        for(let i = 0; i < 40; i++) {
            let loader = document.querySelector('.MuiCircularProgress-root, [role="progressbar"], [data-testid="progressbar"], svg.fa-spin, svg[class*="spin"], .MuiSkeleton-root, [class*="skeleton" i]');
            let hasRealRows = getAllRows().length > 0; if (!loader && hasRealRows) { await wait(250); return true; } await wait(250);
        } return false;
    }

    function getAllRows() { return Array.from(document.querySelectorAll('div.sc-hNikxM')).filter(row => row.querySelector('input[type="checkbox"], svg[data-testid="CheckBoxIcon"], svg[data-testid="CheckBoxOutlineBlankIcon"]') !== null); }
    function getRowElements(row){ if(!row) return null; return { row, rowCheck: row.querySelector('div.rowCheck, [class*="rowCheck"], td:first-child, div:first-child'), span: row.querySelector('span.MuiCheckbox-root, span[class*="Checkbox"], span.MuiButtonBase-root'), input: row.querySelector('input[type="checkbox"]'), svg: row.querySelector('svg') }; }
    function isRowChecked(row){ const el = getRowElements(row); if(!el) return false; return (el.input && el.input.checked) || (el.span && el.span.classList.contains('Mui-checked')) || (el.span && (el.span.className||'').toString().includes('checked')) || row.querySelector('svg[data-testid="CheckBoxIcon"]') !== null; }

    async function tickOneRow(row, setStatus){
        if(isRowChecked(row)) return true;
        row.scrollIntoView({block: 'center', behavior: 'instant'}); await wait(50); const el = getRowElements(row); if(!el) return false;
        if(el.input){ el.input.click(); el.input.checked = true; el.input.dispatchEvent(new Event('click', { bubbles: true })); el.input.dispatchEvent(new Event('change', { bubbles: true })); await wait(100); if(isRowChecked(row)) return true; }
        const visibleTarget = el.span || el.rowCheck || el.svg; if(visibleTarget){ visibleTarget.click(); await wait(100); if(isRowChecked(row)){ return true; } } return false;
    }

    async function untickOneRow(row, setStatus){
        if(!isRowChecked(row)) return true;
        row.scrollIntoView({block: 'center', behavior: 'instant'}); await wait(50); const el = getRowElements(row); if(!el) return false;
        if(el.input){ el.input.click(); el.input.checked = false; el.input.dispatchEvent(new Event('click', { bubbles: true })); el.input.dispatchEvent(new Event('change', { bubbles: true })); await wait(100); if(!isRowChecked(row)) return true; }
        const visibleTarget = el.span || el.rowCheck || el.svg; if(visibleTarget){ visibleTarget.click(); await wait(100); if(!isRowChecked(row)){ return true; } } return false;
    }

    async function uncheckAllCheckedRows(setStatus){
        let rows = []; for(let i=0; i<30; i++){ rows = getAllRows(); if(rows.length > 0) break; await wait(100); }
        const checkedRows = rows.filter(r => isRowChecked(r)); for (let i = 0; i < checkedRows.length; i++) { await untickOneRow(checkedRows[i], setStatus); }
    }

    async function tickFirstRowOnly(setStatus){
        setStatus('9. Ticking row...'); let rows = []; for(let i=0; i<30; i++){ rows = getAllRows(); if(rows.length > 0) break; await wait(100); }
        if(rows.length > 0) await tickOneRow(rows[0], setStatus);
    }

    function isImageActuallyLoaded(expectedFileName) {
        const previewImg = document.querySelector(
            '.ImagePreview img, .sc-cTTzzJ img, div[class*="ImagePreview"] img, div[class*="dragZone"] img, .dragZone img'
        );
        if (previewImg && previewImg.src && previewImg.src !== '' && previewImg.complete && previewImg.naturalWidth > 0) {
            return true;
        }

        const imagePreviewBox = document.querySelector('.ImagePreview [style*="background-image: url"], .sc-cTTzzJ[style*="background-image: url"]');
        const fileNameSpans = Array.from(document.querySelectorAll('span.typography--variant-buttonCondensed, span.sc-cHNdQp, span'));
        const isFileNameVisible = fileNameSpans.some(span => {
            const text = (span.textContent || '').trim();
            return text.includes(expectedFileName) || /\.(webp|png|jpe?g)$|base64,/i.test(text);
        });
        return !!(imagePreviewBox && isFileNameVisible);
    }

    // Direct Image Verification without the 15-second loop
    async function verifyImageUploaded(expectedFileName, setStatus) {
        setStatus('⏳ 7.5 Verifying image upload...');
        LOG('Checking if image is uploaded in Custom Image tab...');

        let tab = null;
        for (let i = 0; i < 15; i++) { tab = findCustomImageTab(); if (tab) break; await wait(50); }
        if (tab) {
            tab.scrollIntoView({ block: 'center', behavior: 'instant' }); await wait(50);
            tab.click(); tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await wait(200);
        } else {
            setStatus('⚠️ Custom Image tab not found for verification');
            return false;
        }

        if (isImageActuallyLoaded(expectedFileName)) {
            setStatus('✅ Image upload verified!');
            LOG('✅ Image verified!');
            await wait(200);
            return true;
        }

        setStatus('⚠️ Image not verified - proceeding...');
        return false;
    }

    function findCancelButton() { let btn = document.querySelector('button.sc-fPksnM.sc-hGfXqB.kJrWBy.gnNdgg'); if (btn && (btn.textContent || '').trim().toLowerCase() === 'cancel') return btn; return Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim().toLowerCase() === 'cancel' && b.offsetParent !== null); }
    async function clickCancelButton(setStatus) { setStatus('10. Cancel...'); let btn = null; for (let i = 0; i < 15; i++) { btn = findCancelButton(); if (btn) break; await wait(50); } if (!btn) return false; btn.scrollIntoView({ block: 'center', behavior: 'instant' }); await wait(50); btn.click(); btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }

    function findSaveButton() { let saveSpan = document.querySelector('span.sc-yaKpG.bsYNoC'); if (saveSpan && (saveSpan.textContent || '').trim().toLowerCase() === 'save') { return saveSpan.closest('button') || saveSpan; } return Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim().toLowerCase() === 'save' && b.offsetParent !== null); }
    async function clickSaveButton(setStatus) { setStatus('10. Save...'); let btn = null; for (let i = 0; i < 15; i++) { btn = findSaveButton(); if (btn) break; await wait(50); } if (!btn) return false; btn.scrollIntoView({ block: 'center', behavior: 'instant' }); await wait(50); btn.click(); btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }

    async function clickProductPartsTab(setStatus){ setStatus('6. Product Parts...'); let tab=null; for(let i=0;i<15;i++){ tab=findProductPartsTab(); if(tab) break; await wait(50); } if(!tab) return false; tab.scrollIntoView({block:'center',behavior:'instant'}); await wait(50); tab.click(); tab.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); await wait(150); return true; }

    async function processSingleFile(file, isUpdateMode, setStatus) {
        const name = file.name.replace(/\.[^/.]+$/, "").trim(); const category = detectCategory(name); const color = extractColor(name);

        await clickCustomImageTab(setStatus); await dropFileIntoZone(file, setStatus);
        setStatus('2. Name...'); let nameInput=null; for(let i=0;i<8;i++){ nameInput=findViewNameInput(); if(nameInput) break; await wait(50); }
        if(nameInput){ nameInput.focus(); setNativeValue(nameInput,''); await wait(20); setNativeValue(nameInput,name); } await wait(100);

        setStatus('3. AutoCode...'); let checkbox=findAutoCodeCheckbox(); if(checkbox){ const label=document.querySelector('label[for="autoCode"]')||checkbox.closest('label'); if(!checkbox.checked){ if(label) label.click(); else checkbox.click(); } } await wait(100);
        await selectViewCategory(category,setStatus); await wait(100);

        let oldColor = null;
        if (isUpdateMode) { const existingColorInput = findUpperSupplierColorInput(); if (existingColorInput && existingColorInput.value) oldColor = existingColorInput.value.trim().toLowerCase(); }
        const tabOk=await clickProductPartsTab(setStatus); if(!tabOk) return; await wait(200);

        if (!isUpdateMode) {
            await uncheckAllCheckedRows(setStatus);
        } else {
            if (oldColor && oldColor !== color?.toLowerCase().trim()) {
                await doFilterSteps(oldColor, setStatus);
                await waitForDynamicLoad(setStatus);
            }
            await uncheckAllCheckedRows(setStatus);
        }

        await doFilterSteps(color,setStatus); await waitForDynamicLoad(setStatus); await wait(10); await tickFirstRowOnly(setStatus); await wait(200);

        await verifyImageUploaded(file.name, setStatus);
        await clickProductPartsTab(setStatus);
        await wait(400);

        if (color) {
            await fillUpperSupplierColor(color, setStatus);
        }

        setStatus('⏳ Finalizing processing (Waiting for UI)...');
        await wait(1200);
    }

    let gxsStatusLog = []; const GXS_MAX_LOG = 4;
    function gxsClassify(txt){ if (txt.startsWith('✅')) return 'success'; if (txt.startsWith('❌')) return 'error'; if (txt.startsWith('⚠️')||txt.startsWith('⏳')) return 'warn'; return 'info'; }

    function gxsSplitFileParts(fileName) { return fileName.replace(/\.[^/.]+$/, "").trim().split('--').map(p => p.trim()).filter(Boolean); }
    function gxsSortColor(fileName) { const parts = gxsSplitFileParts(fileName); if (parts.length >= 3) return parts[parts.length - 2]; if (parts.length === 2) return parts[0]; return ''; }
    function gxsSortView(fileName) { const parts = gxsSplitFileParts(fileName); if (parts.length >= 1) return parts[parts.length - 1]; return ''; }
    function gxsParseOrderList(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const orderMap = new Map(); let idx = 0;
        lines.forEach(line => {
            let color, view;
            if (line.includes('\t')) { const parts = line.split('\t').map(p => p.trim()).filter(Boolean); view = parts.pop(); color = parts.join(' '); }
            else { const parts = line.split(/\s{2,}|\s+/).filter(Boolean); view = parts.pop(); color = parts.join(' '); }
            if (!color || !view) return;
            const key = color.toLowerCase() + '|' + view.toLowerCase();
            if (!orderMap.has(key)) orderMap.set(key, idx);
            idx++;
        });
        return { orderMap, total: idx };
    }

    function autoSortQueue(setStatus) {
        if (sortStagingQueue.length === 0) return;
        const orderTextEl = document.getElementById('gxs-vieworder-input');
        const orderText = orderTextEl ? orderTextEl.value.trim() : '';

        if (!orderText) { if (setStatus) setStatus('⚠️ Please paste the Order List first!'); return; }

        const { orderMap } = gxsParseOrderList(orderText);
        const matchedItems = []; const remainingUnmatched = [];

        sortStagingQueue.forEach(item => {
            const color = gxsSortColor(item.file.name).toLowerCase();
            const view = gxsSortView(item.file.name).toLowerCase();
            const key = color + '|' + view;

            if (orderMap.has(key)) { item.isUnmatched = false; matchedItems.push({ item, idx: orderMap.get(key) }); }
            else { item.isUnmatched = true; remainingUnmatched.push(item); }
        });

        matchedItems.sort((a, b) => a.idx - b.idx);

        matchedItems.forEach(m => { m.item.isUnmatched = false; if (!m.item.row) m.item.row = ''; fileQueue.push(m.item); });
        sortStagingQueue = remainingUnmatched;

        renderQueue(); applyIncrementOrderDOM();

        const matchCount = matchedItems.length;
        const remainMsg = remainingUnmatched.length > 0 ? ` (${remainingUnmatched.length} unmatched images remain in Auto Sort)` : '';
        if (setStatus) setStatus(`🔀 Transferred ${matchCount} images to 'Add New View' Queue!${remainMsg}`);
    }

    function applyIncrementOrderDOM() {
        const checkbox = document.getElementById('gxs-increment-order');
        if (!checkbox || !checkbox.checked) return;
        const baseVal = fileQueue[0] ? String(fileQueue[0].row || '').trim() : '';
        if (baseVal === '') return;
        const base = parseInt(baseVal, 10);
        if (isNaN(base)) return;

        const inputs = document.querySelectorAll('.gxs-row-input');
        for (let i = 1; i < fileQueue.length; i++) {
            fileQueue[i].row = String(base + i);
            if(inputs[i] && inputs[i].value !== fileQueue[i].row) { inputs[i].value = fileQueue[i].row; }
        }
    }

    function smoothReorderQueue(draggedIdx, targetIdx) {
        if (draggedIdx === targetIdx || isNaN(draggedIdx) || isNaN(targetIdx)) return;
        const list = document.getElementById('gxs-queue-list');
        const items = Array.from(list.children);
        const queueArr = getActiveQueueArray();

        const movedItem = queueArr.splice(draggedIdx, 1)[0];
        queueArr.splice(targetIdx, 0, movedItem);

        const oldRects = items.map(el => el.getBoundingClientRect());
        const draggedEl = items[draggedIdx];
        if(targetIdx > draggedIdx) { list.insertBefore(draggedEl, items[targetIdx].nextSibling); }
        else { list.insertBefore(draggedEl, items[targetIdx]); }

        const newItems = Array.from(list.children);
        newItems.forEach((el, idx) => {
            el.dataset.index = idx;
            const numSpan = el.querySelector('.gxs-queue-num');
            if(numSpan) numSpan.textContent = idx + 1;
            const activeTab = document.querySelector('.gxs-tab.active');
            const incrementCheckbox = document.getElementById('gxs-increment-order');
            if (activeTab && activeTab.dataset.tab === 'update' && el.querySelector('.gxs-row-input')) {
                const inp = el.querySelector('.gxs-row-input');
                inp.disabled = (incrementCheckbox && incrementCheckbox.checked && idx > 0);
            }
        });

        newItems.forEach((el, newIdx) => {
            const oldIdx = items.indexOf(el);
            const oldRect = oldRects[oldIdx];
            const newRect = el.getBoundingClientRect();
            const deltaY = oldRect.top - newRect.top;
            if (deltaY !== 0) {
                el.style.transition = 'none'; el.style.transform = `translateY(${deltaY}px)`;
                requestAnimationFrame(() => { el.style.transition = 'transform 0.3s cubic-bezier(0.2, 1, 0.3, 1)'; el.style.transform = ''; });
            }
        });
        applyIncrementOrderDOM();
    }

    function renderQueue() {
        const zone = document.getElementById('gxs-dropzone');
        if(!zone) return;
        const list = zone.querySelector('#gxs-queue-list');
        const batchUi = zone.querySelector('#gxs-batch-ui');
        const incrementRow = zone.querySelector('#gxs-increment-row');
        const incrementCheckbox = zone.querySelector('#gxs-increment-order');
        const vieworderRow = zone.querySelector('#gxs-vieworder-row');
        const countBadge = zone.querySelector('#gxs-count-badge');
        const activeTab = document.querySelector('.gxs-tab.active');
        const isUpdate = activeTab ? activeTab.dataset.tab === 'update' : false;
        const isAutosort = activeTab ? activeTab.dataset.tab === 'autosort' : false;
        const incrementOn = isUpdate && incrementCheckbox && incrementCheckbox.checked;
        const activeQueue = isAutosort ? sortStagingQueue : fileQueue;
        const isProcessing = zone.dataset.state === 'processing';

        const startBtn = zone.querySelector('#gxs-start-batch-btn');
        const stopBtn = zone.querySelector('#gxs-stop-batch-btn');

        if (countBadge) {
            if (activeQueue.length > 0) {
                countBadge.textContent = activeQueue.length; countBadge.style.display = 'inline-flex';
                countBadge.style.animation = 'none'; countBadge.offsetHeight;
                countBadge.style.animation = 'gxsPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
            } else { countBadge.style.display = 'none'; }
        }

        if (activeQueue.length === 0 && !isProcessing) {
            batchUi.classList.remove('visible');
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'none';
            setTimeout(() => { if (activeQueue.length === 0 && zone.dataset.state !== 'processing') { batchUi.style.display = 'none'; list.innerHTML = ''; } }, 300);
            return;
        }

        batchUi.style.display = 'flex';
        setTimeout(() => batchUi.classList.add('visible'), 10);

        if (isProcessing) {
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'block';
            list.style.display = 'none';
            incrementRow.style.display = 'none';
            vieworderRow.style.display = 'none';
            return;
        } else {
            if (startBtn) startBtn.style.display = isAutosort ? 'none' : 'block';
            if (stopBtn) stopBtn.style.display = 'none';
            list.style.display = 'flex';
            incrementRow.style.display = isUpdate ? 'flex' : 'none';
            vieworderRow.style.display = isAutosort ? 'flex' : 'none';
        }

        list.innerHTML = '';

        activeQueue.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = "gxs-queue-item";
            div.draggable = true; div.dataset.index = i; div.style.animationDelay = `${i * 0.05}s`;

            if (item.isUnmatched) { div.style.borderLeft = '3px solid #f59e0b'; div.style.opacity = '0.65'; div.title = "Not found in text list"; }
            else { div.style.borderLeft = '1px solid transparent'; div.style.opacity = '1'; div.title = ""; }

            div.ondragstart = (e) => { e.dataTransfer.setData('text/plain', div.dataset.index); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => div.classList.add('dragging'), 50); };
            div.ondragend = () => { div.classList.remove('dragging'); document.querySelectorAll('.gxs-queue-item').forEach(el => el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom')); };
            div.ondragover = (e) => {
                e.preventDefault(); e.dataTransfer.dropEffect = 'move';
                const rect = div.getBoundingClientRect(); const relY = e.clientY - rect.top;
                if(relY < rect.height / 2) { div.classList.add('drag-over-top'); div.classList.remove('drag-over-bottom'); }
                else { div.classList.add('drag-over-bottom'); div.classList.remove('drag-over-top'); }
            };
            div.ondragleave = () => { div.classList.remove('drag-over-top', 'drag-over-bottom'); };
            div.ondrop = (e) => {
                e.preventDefault(); div.classList.remove('drag-over-top', 'drag-over-bottom');
                const draggedIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const targetIdx = parseInt(div.dataset.index, 10);
                smoothReorderQueue(draggedIdx, targetIdx);
            };

            const numBadge = document.createElement('span');
            numBadge.className = "gxs-queue-num"; numBadge.textContent = i + 1; div.appendChild(numBadge);

            const ctrls = document.createElement('div');
            ctrls.className = "gxs-queue-ctrls";
            ctrls.innerHTML = `<button data-index="${i}" data-action="remove" title="Remove Image" class="gxs-remove-btn">
                                  <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                      <line x1="10" y1="11" x2="10" y2="17"></line>
                                      <line x1="14" y1="11" x2="14" y2="17"></line>
                                  </svg>
                               </button>`;
            div.appendChild(ctrls);

            const thumb = document.createElement('img');
            thumb.className = "gxs-queue-thumb"; thumb.src = item.thumbUrl; thumb.onerror = () => { thumb.style.display = 'none'; }; div.appendChild(thumb);

            const nameSpan = document.createElement('span');
            nameSpan.className = "gxs-queue-name"; nameSpan.textContent = buildShortLabel(item.file.name); div.appendChild(nameSpan);

            if (isUpdate) {
                const rowInp = document.createElement('input');
                rowInp.className = "gxs-row-input"; rowInp.type = "number"; rowInp.min = "1"; rowInp.placeholder = "Row #"; rowInp.value = item.row || '';
                const isLocked = incrementOn && i > 0; rowInp.disabled = isLocked;
                rowInp.oninput = (e) => { const currentIdx = parseInt(div.dataset.index, 10); getActiveQueueArray()[currentIdx].row = e.target.value; };
                rowInp.onblur = () => applyIncrementOrderDOM();
                rowInp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') rowInp.blur(); };
                rowInp.onclick = (e) => e.stopPropagation();
                div.appendChild(rowInp);
            }
            list.appendChild(div);
        });
    }

    function createDropZone(){
        if(document.getElementById('gxs-dropzone')) return;
        const zone=document.createElement('div'); zone.id='gxs-dropzone';
        zone.dataset.state = 'idle';
        zone.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

#gxs-dropzone{
    --gxs-accent: #D4AF37;
    --gxs-accent-2: #F1E5AC;
    --gxs-accent-soft: rgba(212, 175, 55, 0.18);
    --gxs-success: #4ADE80;
    --gxs-error: #FF6B6B;
    --gxs-warn: #FACC15;
    --gxs-bg: rgba(10, 10, 12, 0.90);
    --gxs-bg-elevated: rgba(18, 18, 22, 0.95);
    --gxs-border: rgba(212, 175, 55, 0.15);
    --gxs-text: #F8F8F8;
    --gxs-text-dim: #A0A0A5;

    position:fixed; top:0; right:0; height:100vh; z-index:99999999; width:320px;
    min-width:260px; max-width:520px;
    display:flex; flex-direction:column;
    border-radius:0; border-left:1px solid var(--gxs-border);
    background:linear-gradient(160deg, var(--gxs-bg-elevated) 0%, var(--gxs-bg) 100%);
    backdrop-filter:blur(30px) saturate(200%);
    -webkit-backdrop-filter:blur(30px) saturate(200%);
    color:var(--gxs-text); font-family:'Inter',sans-serif;
    box-shadow: -15px 0 40px -10px rgba(0,0,0,0.8);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease, border-color 0.4s ease;
}

#gxs-batch-ui { display: none; flex-direction: column !important; opacity: 0; transform: translateY(-10px); transition: opacity 0.4s ease, transform 0.4s ease; }
#gxs-batch-ui.visible { opacity: 1; transform: translateY(0); }
#gxs-dropzone[data-state="idle"] { border-left-color: var(--gxs-border); }
#gxs-dropzone[data-state="processing"] { border-left-color: var(--gxs-accent); box-shadow: inset 2px 0 15px var(--gxs-accent-soft), -20px 0 50px -10px rgba(0,0,0,0.9); }
#gxs-dropzone[data-state="done"] { border-left-color: var(--gxs-success); box-shadow: inset 2px 0 15px rgba(74, 222, 128, 0.15), -20px 0 50px -10px rgba(0,0,0,0.9); }
#gxs-dropzone.closed { transform: translateX(100%); box-shadow: none; }

#gxs-toggle-panel {
    position: absolute; left: -32px; top: 24px; width: 32px; height: 54px;
    background: linear-gradient(160deg, var(--gxs-bg-elevated) 0%, var(--gxs-bg) 100%);
    border: 1px solid var(--gxs-border); border-right: none; border-radius: 8px 0 0 8px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--gxs-text-dim); box-shadow: -4px 0 12px rgba(0,0,0,0.5);
    transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
    backdrop-filter: blur(30px) saturate(200%);
}
#gxs-toggle-panel:hover { color: var(--gxs-accent); background: var(--gxs-bg); border-color: var(--gxs-accent-soft); }
#gxs-toggle-panel svg { width: 14px; height: 14px; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); fill: currentColor; }
#gxs-dropzone.closed #gxs-toggle-panel svg { transform: rotate(180deg); }

#gxs-dropzone.resizing{ transition:none; user-select:none; }
#gxs-dropzone:hover{ box-shadow: -20px 0 50px -10px rgba(0,0,0,0.9); }
#gxs-dropzone.dragover{ border-left-color:var(--gxs-accent); box-shadow: inset 4px 0 20px var(--gxs-accent-soft), -20px 0 50px -10px rgba(0,0,0,0.9); }

#gxs-dropzone *{ box-sizing:border-box; }
#gxs-dropzone ::-webkit-scrollbar{ width:4px; height:4px; }
#gxs-dropzone ::-webkit-scrollbar-track{ background:transparent; }
#gxs-dropzone ::-webkit-scrollbar-thumb{ background:rgba(212, 175, 55, 0.3); border-radius:10px; }
#gxs-dropzone ::-webkit-scrollbar-thumb:hover{ background:var(--gxs-accent); }

#gxs-tabs { display:flex; gap:4px; padding:8px 10px 0 10px; position: relative; }
.gxs-tab { flex:1; background:transparent; border:none; color:var(--gxs-text-dim); font-family:inherit; font-size:12px; font-weight:500; padding:10px 0; cursor:pointer; transition:color .3s ease, background .3s ease; border-radius:9px 9px 0 0; position:relative; }
.gxs-tab.active { color:var(--gxs-accent-2); background:rgba(212, 175, 55, 0.05); font-weight:600; }
.gxs-tab::after { content:''; position:absolute; left:50%; right:50%; bottom:0; height:2px; border-radius:2px; background:linear-gradient(90deg, var(--gxs-accent), var(--gxs-accent-2)); transition: left 0.3s ease, right 0.3s ease; opacity: 0; }
.gxs-tab.active::after{ left:10%; right:10%; opacity: 1; }
.gxs-tab:hover:not(.active) { color:#EAEAEA; }

#gxs-header{ display:flex; align-items:center; justify-content:space-between; padding:16px 16px 10px 16px; cursor:pointer; flex-shrink:0; }
#gxs-header-left{ display:flex; align-items:center; gap:12px; min-width:0; }

#gxs-icon-dot{ width:8px; height:8px; border-radius:50%; box-shadow:0 0 10px var(--gxs-accent-soft); flex-shrink:0; transition: background 0.4s ease, transform 0.4s ease; }
#gxs-dropzone[data-state="idle"] #gxs-icon-dot { background: rgba(255,255,255,0.2); animation: gxsPulseIdle 3s ease-in-out infinite; }
#gxs-dropzone[data-state="processing"] #gxs-icon-dot { background: linear-gradient(135deg, var(--gxs-accent), var(--gxs-accent-2)); animation: gxsPulseProcess 1s ease-in-out infinite; }
#gxs-dropzone[data-state="done"] #gxs-icon-dot { background: var(--gxs-success); animation: none; transform: scale(1.2); box-shadow: 0 0 15px rgba(74,222,128,0.5); }

@keyframes gxsPulseIdle{ 0%,100%{ opacity:0.6; transform:scale(1); } 50%{ opacity:1; transform:scale(1.1); box-shadow:0 0 8px rgba(255,255,255,0.3); } }
@keyframes gxsPulseProcess{ 0%,100%{ transform:scale(1); box-shadow:0 0 10px var(--gxs-accent-soft); } 50%{ transform:scale(1.3); box-shadow:0 0 20px var(--gxs-accent); } }

@keyframes gxsGoldShineText { to { background-position: 200% center; } }
@keyframes gxsSilverShineText { to { background-position: 200% center; } }

#gxs-title{ font-size:14px; font-weight:600; color:var(--gxs-text); letter-spacing:0.5px; display:flex; align-items:center; text-transform: uppercase; }

#gxs-title-text {
    background: linear-gradient(90deg, #c5a059 0%, #ffdf8d 40%, #ffffff 50%, #ffdf8d 60%, #c5a059 100%);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gxsGoldShineText 2.5s linear infinite;
    font-weight: 800;
}

#gxs-version {
    font-size: 10.5px; margin-top: 2px; font-weight: 800; letter-spacing: 1.5px;
    background: linear-gradient(90deg, #999999 0%, #e0e0e0 40%, #ffffff 50%, #e0e0e0 60%, #999999 100%);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gxsSilverShineText 2.5s linear infinite;
    text-transform: uppercase;
}

.gxs-count-badge{ display:none; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; margin-left:7px; font-size:10.5px; font-weight:700; border-radius:9px; background:linear-gradient(135deg, var(--gxs-accent), var(--gxs-accent-2)); color:#000; box-shadow:0 2px 8px var(--gxs-accent-soft); }

#gxs-body{ padding:0; flex:1; overflow:hidden; display:flex; flex-direction:column; }
#gxs-scroll-section{ flex:1; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; }
#gxs-fixed-footer{ flex-shrink:0; padding:14px 16px; background: rgba(14, 14, 16, 0.95); border-top: 1px solid var(--gxs-border); box-shadow: 0 -5px 15px rgba(0,0,0,0.3); margin-top:auto;}

#gxs-current-status{ font-size:12px; font-weight:400; color:var(--gxs-text-dim); min-height:18px; margin-top:2px; line-height:1.4; transition:color .3s ease; }
#gxs-current-status.success{ color:var(--gxs-success); } #gxs-current-status.error{ color:var(--gxs-error); } #gxs-current-status.warn{ color:var(--gxs-warn); }

#gxs-progress{ margin-top:12px; width:100%; height:2px; border-radius:2px; overflow:hidden; background:rgba(255,255,255,.05); position: relative; }
#gxs-progress-bar{ width:30%; height:100%; background:linear-gradient(90deg, transparent, var(--gxs-accent), transparent); border-radius:2px; transition: opacity 0.3s ease; opacity: 0; }
#gxs-dropzone[data-state="processing"] #gxs-progress-bar { opacity: 1; animation: gxsProgressFlow 1.5s ease-in-out infinite; box-shadow: 0 0 10px var(--gxs-accent); }
@keyframes gxsProgressFlow{ 0%{ transform:translateX(-150%); } 100%{ transform:translateX(350%); } }

#gxs-log{ margin-top:12px; max-height:80px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding-right:2px; margin-bottom: 12px; }
.gxs-log-line{ font-size:11px; color:var(--gxs-text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:400; animation: gxsFadeInLog 0.3s ease forwards; }
.gxs-log-line.success{ color:var(--gxs-success); } .gxs-log-line.error{ color:var(--gxs-error); } .gxs-log-line.warn{ color:var(--gxs-warn); }

#gxs-process-history { display: none; margin-top:12px; border-top:1px solid var(--gxs-border); padding-top:12px; font-size:11px; }
.history-row { display:flex; justify-content:space-between; margin-bottom:6px; animation: gxsFadeInLog 0.3s ease forwards;}
.history-name { color: #D1D1D6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%; font-weight: 300;}
.history-status { color: var(--gxs-accent); font-weight: 500; white-space: nowrap; }

.gxs-action-row { margin-top:12px; display:flex; align-items:center; gap:8px; }
.gxs-action-row label { font-size:12px; color:var(--gxs-text-dim); cursor:pointer; font-weight:400; transition: color 0.2s ease; }
.gxs-action-row:hover label { color: var(--gxs-accent-2); }
.gxs-action-row input[type="checkbox"] { cursor:pointer; accent-color:var(--gxs-accent); width:14px; height:14px; }

#gxs-buttons-wrapper { display: flex; flex-direction: column; gap: 8px; }
#gxs-start-batch-btn, #gxs-stop-batch-btn, #gxs-reset-btn{
    width:100%; padding:12px; font-family:inherit; font-size:13px; font-weight:600; letter-spacing:1px; text-transform: uppercase;
    border:1px solid transparent; border-radius:8px; cursor:pointer; transition:all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
#gxs-start-batch-btn{ display: none; background:linear-gradient(135deg, rgba(212,175,55,0.9), rgba(241,229,172,0.9)); color:#111; box-shadow:0 4px 15px rgba(212,175,55,0.2); }
#gxs-start-batch-btn:hover{ filter:brightness(1.1); transform:translateY(-2px); box-shadow:0 6px 20px rgba(212,175,55,0.3); border-color: #FFF; }
#gxs-start-batch-btn:active{ transform:translateY(0) scale(0.98); }

#gxs-stop-batch-btn{ background:rgba(255,107,107,0.1); color:var(--gxs-error); border:1px solid rgba(255,107,107,0.3); }
#gxs-stop-batch-btn:hover{ background:rgba(255,107,107,0.2); box-shadow: 0 4px 15px rgba(255,107,107,0.2); }

#gxs-reset-btn{ background:transparent; color:var(--gxs-text-dim); border:1px solid rgba(255,255,255,0.1); }
#gxs-reset-btn:hover{ background:rgba(212,175,55,0.05); color:var(--gxs-accent); border-color:var(--gxs-accent-soft); }

#gxs-queue-list{ display:flex; flex-direction:column; gap:6px; min-height:0; padding: 4px 0; }
.gxs-queue-item{
    display:flex; gap:10px; align-items:center; padding:8px; border-radius:8px; background:rgba(255,255,255,0.02);
    border:1px solid rgba(255,255,255,0.05); font-size:11px;
    transition: all 0.3s ease; animation: gxsFadeInQueueItem 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.gxs-queue-item:hover{ background:rgba(212,175,55,0.05); border-color:var(--gxs-border); transform: translateX(2px); }

.gxs-queue-num{ flex-shrink:0; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; color:var(--gxs-text-dim); background:rgba(255,255,255,0.05); border-radius:4px; transition: all 0.3s ease; }
.gxs-queue-item:hover .gxs-queue-num { background:var(--gxs-accent); color: #111; box-shadow: 0 0 8px var(--gxs-accent-soft); }
.gxs-queue-thumb{ width:32px; height:32px; object-fit:cover; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:#0b0b0e; transition: filter 0.3s ease; }
.gxs-queue-item:hover .gxs-queue-thumb { border-color: var(--gxs-accent-soft); }
.gxs-queue-name{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#E0E0E0; font-weight:400; font-size:12px; }

.gxs-queue-ctrls { display: flex; align-items: center; }
.gxs-remove-btn { background: transparent; border: none; color: var(--gxs-text-dim); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s ease; }
.gxs-remove-btn:hover { background: rgba(255, 107, 107, 0.15); color: var(--gxs-error); }
.gxs-remove-btn svg { width: 14px; height: 14px; }

.gxs-row-input{ width:50px; padding:6px 4px; font-family:inherit; font-size:11px; font-weight:600; background:rgba(0,0,0,0.2); color:var(--gxs-text); border:1px solid rgba(255,255,255,0.1); border-radius:4px; text-align:center; transition:all 0.3s ease; }
.gxs-row-input:focus{ outline:none; border-color:var(--gxs-accent); background:rgba(212,175,55,0.05); box-shadow: 0 0 8px var(--gxs-accent-soft); }

.gxs-resize-left{ left:0; top:0; bottom:0; width:6px; cursor:ew-resize; position:absolute; z-index:5; }
.gxs-resize-left::after{ content:''; position:absolute; top:0; bottom:0; left:2px; width:2px; border-radius:2px; transition:background .3s ease; }
.gxs-resize-left:hover::after{ background:var(--gxs-accent); box-shadow: 0 0 8px var(--gxs-accent); }
</style>

<div id="gxs-toggle-panel" title="Toggle Sidebar"><svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg></div>
<div id="gxs-header">
  <div id="gxs-header-left"><span id="gxs-icon-dot"></span><div><div id="gxs-title"><span id="gxs-title-text">Product Uploader</span><span id="gxs-count-badge" class="gxs-count-badge">0</span></div><div id="gxs-version">PREMIUM V8.4</div></div></div>
</div>

<div id="gxs-tabs">
    <button class="gxs-tab active" data-tab="add">Add New View</button>
    <button class="gxs-tab" data-tab="update">Update View</button>
    <button class="gxs-tab" data-tab="autosort">Auto Sort</button>
</div>

<div id="gxs-body">
  <!-- TOP SCROLLABLE SECTION -->
  <div id="gxs-scroll-section">
      <div id="gxs-batch-ui">
          <div id="gxs-increment-row" style="display:none; align-items:center; gap:8px; margin-bottom:10px; font-size:12px; color:#A0A0A5;">
              <input type="checkbox" id="gxs-increment-order" style="cursor:pointer; accent-color:var(--gxs-accent);">
              <label for="gxs-increment-order" style="cursor:pointer;">Increment Row Order (+1)</label>
          </div>
          <div id="gxs-vieworder-row" style="display:none; flex-direction:column; gap:8px; margin-bottom:10px; font-size:12px; color:var(--gxs-text-dim);">
              <label for="gxs-vieworder-input" style="font-weight:500; color:#E0E0E0;">Sort Order (Paste List):</label>
              <textarea id="gxs-vieworder-input" rows="6" spellcheck="false" placeholder="Color[Tab]View..." style="width:100%; resize:vertical; font-family:inherit; font-size:11px; background:rgba(0,0,0,0.2); color:var(--gxs-text); border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:8px; transition:border 0.3s;"></textarea>
              <button id="gxs-sort-now-btn" style="padding:8px; font-family:inherit; font-size:12px; font-weight:600; border:1px solid var(--gxs-border); border-radius:6px; cursor:pointer; background:rgba(212,175,55,0.05); color:var(--gxs-accent); transition:all 0.3s; margin-top: 6px;">🔀 Match & Sort</button>
          </div>
          <div id="gxs-queue-list"></div>
      </div>
      <div id="gxs-process-history"></div>
  </div>

  <!-- FIXED BOTTOM SECTION -->
  <div id="gxs-fixed-footer">
      <div id="gxs-current-status">Ready — Drop/Select Images First</div>
      <div id="gxs-progress"><div id="gxs-progress-bar"></div></div>
      <div id="gxs-log"></div>

      <div id="gxs-buttons-wrapper">
          <button id="gxs-start-batch-btn">Start Batch Upload</button>
          <button id="gxs-stop-batch-btn" style="display:none;">⏹ Stop Batch</button>
          <button id="gxs-reset-btn">↺ Reset Interface</button>
      </div>

      <div class="gxs-action-row">
        <input type="checkbox" id="gxs-save-action" checked>
        <label for="gxs-save-action">Click <b>Save</b> instead of Cancel at end</label>
      </div>
  </div>
</div>
<input type="file" id="gxs-fileinput" accept="image/*" multiple style="display:none;">
<div class="gxs-resize-handle gxs-resize-left" title="Resize width"></div>
`;
        document.body.appendChild(zone);

        const fileInput=zone.querySelector('#gxs-fileinput');
        const header=zone.querySelector('#gxs-header');
        const currentStatusEl=zone.querySelector('#gxs-current-status');
        const logEl=zone.querySelector('#gxs-log');
        const historyEl = zone.querySelector('#gxs-process-history');
        const toggleBtn = zone.querySelector('#gxs-toggle-panel');
        const resetBtn = zone.querySelector('#gxs-reset-btn');

        const setStatus = (txt)=>{
            const type = gxsClassify(txt);
            currentStatusEl.textContent = txt; currentStatusEl.className = type === 'info' ? '' : type;
            gxsStatusLog.push({ txt, type }); if (gxsStatusLog.length > GXS_MAX_LOG) gxsStatusLog.shift();
            logEl.innerHTML = gxsStatusLog.map(s => `<div class="gxs-log-line ${s.type === 'info' ? '' : s.type}">${s.txt}</div>`).join('');
            logEl.scrollTop = logEl.scrollHeight; LOG(txt);
        };

        function fullReset(){
            batchStopRequested = true;
            fileQueue.forEach(item => { if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl); }); fileQueue = [];
            sortStagingQueue.forEach(item => { if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl); }); sortStagingQueue = [];
            gxsStatusLog = []; logEl.innerHTML = ''; historyEl.innerHTML = ''; historyEl.style.display = 'none';
            const incCheckbox = zone.querySelector('#gxs-increment-order'); if (incCheckbox) incCheckbox.checked = false;
            const orderEl = zone.querySelector('#gxs-vieworder-input'); if (orderEl) orderEl.value = '';

            zone.dataset.state = 'idle';
            renderQueue(); setStatus('↺ UI Reset — Ready.');
        }

        toggleBtn.onclick = (e) => { e.stopPropagation(); zone.classList.toggle('closed'); };
        resetBtn.onclick = (e) => { e.stopPropagation(); fullReset(); };

        const tabs = zone.querySelectorAll('.gxs-tab');
        tabs.forEach(tab => {
            tab.onclick = (e) => {
                e.stopPropagation(); tabs.forEach(t => t.classList.remove('active')); tab.classList.add('active');
                const gxsBody = zone.querySelector('#gxs-scroll-section'); gxsBody.style.opacity = '0.5';
                setTimeout(() => { gxsBody.style.opacity = '1'; renderQueue(); }, 150);
            };
        });

        zone.querySelector('#gxs-increment-order').onchange = (e) => { e.stopPropagation(); if (e.target.checked) applyIncrementOrderDOM(); else renderQueue(); };
        zone.querySelector('#gxs-increment-row').onclick = (e) => e.stopPropagation();
        zone.querySelector('#gxs-vieworder-row').onclick = (e) => e.stopPropagation();
        zone.querySelector('#gxs-sort-now-btn').onclick = (e) => { e.stopPropagation(); autoSortQueue(setStatus); };

        zone.querySelector('#gxs-queue-list').onclick = (e) => {
            const btn = e.target.closest('button'); if (!btn) return; e.stopPropagation();
            const idx = parseInt(btn.dataset.index); const action = btn.dataset.action;
            if (action === 'remove') {
                const itemEl = btn.closest('.gxs-queue-item');
                if(itemEl) {
                    itemEl.style.transform = 'translateX(-20px)'; itemEl.style.opacity = '0';
                    setTimeout(() => {
                        const queueArr = getActiveQueueArray();
                        if (queueArr[idx] && queueArr[idx].thumbUrl) URL.revokeObjectURL(queueArr[idx].thumbUrl);
                        queueArr.splice(idx, 1); renderQueue(); applyIncrementOrderDOM();
                    }, 250);
                }
            }
        };

        zone.querySelector('#gxs-start-batch-btn').onclick = async (e) => {
            e.stopPropagation();
            if(fileQueue.length === 0) return;
            const isUpdate = document.querySelector('.gxs-tab.active').dataset.tab === 'update';
            const shouldSave = document.getElementById('gxs-save-action').checked;

            if (isUpdate) {
                const missing = fileQueue.find(item => !item.row || String(item.row).trim() === '');
                if (missing) { setStatus('❌ Please give a Row number for every image!'); return; }
            }

            batchStopRequested = false;
            zone.dataset.state = 'processing';
            renderQueue();
            toggleClickBlocker(true);

            historyEl.style.display = 'block'; historyEl.innerHTML = '';
            const batchStartTime = Date.now();
            let stoppedAt = -1;
            let wasUserStop = false;

            try {
                for (let i = 0; i < fileQueue.length; i++) {
                    stoppedAt = i;
                    const item = fileQueue[i]; const itemStartTime = Date.now();
                    setStatus(`⏳ [${i+1}/${fileQueue.length}] Uploading: ${item.file.name}...`);

                    if (isUpdate) {
                        setStatus(`Opening Row ${item.row}...`); const opened = await openRowAndAwaitModal(item.row, setStatus);
                        if (!opened) { setStatus(`❌ Could not open Row ${item.row}. Batch stopped.`); break; }
                    } else {
                        setStatus(`Opening Add New View...`); const opened = await openAddViewAndAwaitModal(setStatus);
                        if (!opened) { setStatus(`❌ Could not open Add View. Batch stopped.`); break; }
                    }

                    await processSingleFile(item.file, isUpdate, setStatus);

                    if (shouldSave) { await clickSaveButton(setStatus); } else { await clickCancelButton(setStatus); }
                    await awaitModalClose(setStatus);
                    if (isUpdate) { await awaitRowEnlargeReady(item.row, setStatus); }

                    const itemElapsed = ((Date.now() - itemStartTime) / 1000).toFixed(1);
                    historyEl.innerHTML += `<div class="history-row"><span class="history-name">${i+1}. ${item.file.name}</span> <span class="history-status">DONE - ${itemElapsed}s</span></div>`;
                    historyEl.scrollTop = historyEl.scrollHeight; await wait(800);
                }
                stoppedAt = -1;
            } catch (err) {
                if (err.name === 'BatchStopError') {
                    wasUserStop = true;
                } else {
                    console.error(err);
                }
            }

            toggleClickBlocker(false);

            const totalElapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
            if(stoppedAt === -1 && !wasUserStop) {
                historyEl.innerHTML += `<div style="margin-top:10px; color:var(--gxs-accent); font-weight:bold; text-align:center; border-top:1px dashed var(--gxs-border); padding-top:8px;">Batch Complete in ${totalElapsed}s</div>`;
            }
            historyEl.scrollTop = historyEl.scrollHeight;

            if (wasUserStop || stoppedAt >= 0) {
                const processedIndex = wasUserStop ? stoppedAt : stoppedAt + 1;
                const processed = fileQueue.splice(0, processedIndex);
                processed.forEach(item => { if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl); });
                batchStopRequested = false;
                zone.dataset.state = 'idle';
                renderQueue();
                if (wasUserStop) { setStatus(`⏹ Batch instantly stopped! (${processedIndex} done)`); }
            } else {
                fileQueue.forEach(item => { if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl); });
                fileQueue = [];
                zone.dataset.state = 'done';
                renderQueue();
                setStatus('✅ Entire batch uploaded successfully!');
                setTimeout(() => { if(!batchStopRequested) zone.dataset.state = 'idle'; }, 4000);
            }
        };

        zone.querySelector('#gxs-stop-batch-btn').onclick = (e) => {
            e.stopPropagation();
            batchStopRequested = true;
            setStatus('⏹ Stopping instantly...');
        };

        (function setupResize(){
            const leftHandle = zone.querySelector('.gxs-resize-left'); const MIN_WIDTH = 260, MAX_WIDTH = 520;
            let resizing = false; let startX = 0, startWidth = 0;
            function onDrag(e){ if (!resizing) return; zone.style.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - (e.clientX - startX))) + 'px'; }
            function stopDrag(){ resizing = false; zone.classList.remove('resizing'); document.body.style.userSelect = ''; document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', stopDrag); }
            function startDrag(e){ e.preventDefault(); e.stopPropagation(); resizing = true; startX = e.clientX; startWidth = zone.offsetWidth; zone.classList.add('resizing'); document.body.style.userSelect = 'none'; document.addEventListener('mousemove', onDrag); document.addEventListener('mouseup', stopDrag); }
            leftHandle.addEventListener('mousedown', startDrag);
        })();

        const runWithAccent = async (files)=>{
            if (files && files.length > 0) {
                let filesToAdd = Array.from(files);
                const activeTab = document.querySelector('.gxs-tab.active');
                const isAutosort = activeTab ? activeTab.dataset.tab === 'autosort' : false;
                const targetQueue = isAutosort ? sortStagingQueue : fileQueue;

                filesToAdd.forEach(f => targetQueue.push({ file: f, row: "", thumbUrl: URL.createObjectURL(f), isUnmatched: false }));
                renderQueue(); applyIncrementOrderDOM();

                if (isAutosort) setStatus(`📦 Added ${filesToAdd.length} image(s) to Auto Sort Queue.`);
                else setStatus(`📦 Added ${filesToAdd.length} image(s) to Queue.`);
            }
        };

        header.onclick=()=>fileInput.click();
        zone.querySelector('#gxs-scroll-section').onclick=(e)=>{
            if(e.target.closest('#gxs-log') || e.target.closest('.gxs-action-row') || e.target.closest('#gxs-batch-ui') || e.target.closest('#gxs-process-history') || e.target.closest('#gxs-reset-btn') || e.target.closest('#gxs-vieworder-row')) return;
            fileInput.click();
        };
        fileInput.onchange=e=>runWithAccent(e.target.files);
        zone.ondragover=e=>{ e.preventDefault(); zone.classList.add('dragover'); }; zone.ondragleave=()=>zone.classList.remove('dragover');
        zone.ondrop=e=>{ e.preventDefault(); zone.classList.remove('dragover'); runWithAccent(e.dataTransfer.files); };
    }

    setTimeout(()=>{ createDropZone(); LOG('UX Optimized Batch Auto V8.4 Ready'); },500);
})();
