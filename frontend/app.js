const API_BASE = '/api';
let token = localStorage.getItem('token');
let isDarkMode = localStorage.getItem('theme') === 'dark';
if (isDarkMode || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    isDarkMode = true;
}

// --- State ---
let equipments = [];
let activeAction = null; // 'receive' or 'dispatch'
let activeSerialNumber = null;
let signaturePad = null;
let currentContextMenuSerial = null;

let html5QrcodeScanner = null;
let pcLiveScanner = null;

// --- DOM Elements ---
const btnRegisterEquipment = document.getElementById('btnRegisterEquipment');
const manualBarcodeInput = document.getElementById('manualBarcodeInput');
const modalOverlay = document.getElementById('modalOverlay');
const barcodeModal = document.getElementById('barcodeModal');
const signatureModal = document.getElementById('signatureModal');
const detailsModal = document.getElementById('detailsModal');
const globalHistoryModal = document.getElementById('globalHistoryModal');
const canvas = document.getElementById('signatureCanvas');
const contextMenu = document.getElementById('contextMenu');
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const metricTotal = document.getElementById('metricTotal');
const metricReceived = document.getElementById('metricReceived');
const metricDispatched = document.getElementById('metricDispatched');
const tableSearch = document.getElementById('tableSearch');
const btnExportExcel = document.getElementById('btnExportExcel');
const btnDarkMode = document.getElementById('btnDarkMode');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSignaturePad();
    setupEventListeners();

    if (typeof Html5Qrcode !== 'undefined') {
        try {
            html5QrcodeScanner = new Html5Qrcode("qr-reader-hidden", {
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.QR_CODE
                ]
            }); 
        } catch(e) {
            console.error("Error init Html5Qrcode", e);
        }
    }
});

function initSignaturePad() {
    signaturePad = new SignaturePad(canvas, {
        penColor: "rgb(15, 23, 42)", // Tailwind slate-900
        backgroundColor: "rgb(255, 255, 255)", // Solid white background to prevent blank rendering issues
        minWidth: 1.5,
        maxWidth: 3
    });
    // Do not attach window resize listener to avoid clearing canvas when mobile keyboard opens
}

function resizeCanvas() {
    // When zoomed out to less than 100%, for some very strange reason,
    // some browsers report devicePixelRatio as less than 1
    // and only part of the canvas is cleared then.
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    // Canvas dimensions are derived from parent size
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);

    signaturePad.clear(); // otherwise signature will be stretched
}

function checkAuth() {
    if (token) {
        loginOverlay.classList.add('hidden');
        btnLogout.classList.remove('hidden');
        fetchEquipments();
    } else {
        loginOverlay.classList.remove('hidden');
        btnLogout.classList.add('hidden');
    }
}

function logout() {
    token = null;
    localStorage.removeItem('token');
    checkAuth();
}

async function apiFetch(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }
    return res;
}

// --- Event Listeners ---
function setupEventListeners() {

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnLoginSubmit');
            const errorMsg = document.getElementById('loginError');
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            btn.disabled = true;
            btn.textContent = 'Verificando...';
            errorMsg.classList.add('hidden');
            
            try {
                const formData = new URLSearchParams();
                formData.append('username', username);
                formData.append('password', password);
                
                const res = await fetch(`${API_BASE}/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                });
                
                if (res.ok) {
                    const data = await res.json();
                    token = data.access_token;
                    localStorage.setItem('token', token);
                    document.getElementById('loginPassword').value = '';
                    checkAuth();
                } else {
                    errorMsg.classList.remove('hidden');
                }
            } catch (e) {
                errorMsg.textContent = 'Error de conexión';
                errorMsg.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Ingresar';
            }
        });
    }

    if (btnDarkMode) {
        btnDarkMode.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            isDarkMode = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }

    const btnTogglePassword = document.getElementById('btnTogglePassword');
    if (btnTogglePassword) {
        btnTogglePassword.addEventListener('click', () => {
            const loginPassword = document.getElementById('loginPassword');
            if (loginPassword.type === 'password') {
                loginPassword.type = 'text';
                btnTogglePassword.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0a9.953 9.953 0 015.71-1.581c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>`;
            } else {
                loginPassword.type = 'password';
                btnTogglePassword.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>`;
            }
        });
    }

    if (tableSearch) {
        tableSearch.addEventListener('input', renderTable);
    }

    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => exportToExcel());
    }

    const btnGlobalHistory = document.getElementById('btnGlobalHistory');
    if (btnGlobalHistory) {
        btnGlobalHistory.addEventListener('click', showGlobalHistoryModal);
    }

    btnRegisterEquipment.addEventListener('click', () => {
        startFlow('receive', null);
    });

    const nativeCameraInput = document.getElementById('nativeCameraInput');
    const pcFileInput = document.getElementById('pcFileInput');
    
    const handleImageScan = async (e) => {
        if (e.target.files.length == 0) return;
        let file = e.target.files[0];
        
        showToast('Analizando código...', 'success');

        try {
            const rawImg = new Image();
            rawImg.src = URL.createObjectURL(file);
            await new Promise(r => { rawImg.onload = r; rawImg.onerror = r; });

            // RESIZE IMAGE (CRITICAL FOR PHONE CAMERAS)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxDim = 1000;
            let width = rawImg.width;
            let height = rawImg.height;
            if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(rawImg, 0, 0, width, height);

            const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const img = new Image();
            img.src = resizedDataUrl;
            await new Promise(r => { img.onload = r; img.onerror = r; });

            // 1. Try Native BarcodeDetector
            if ('BarcodeDetector' in window) {
                try {
                    const detector = new BarcodeDetector({ 
                        formats: ['code_128', 'code_39', 'ean_13', 'upc_a', 'qr_code', 'itf'] 
                    });
                    const barcodes = await detector.detect(img);
                    if (barcodes.length > 0) {
                        manualBarcodeInput.value = barcodes[0].rawValue;
                        showToast('Código escaneado correctamente.');
                        e.target.value = '';
                        submitManualBarcode();
                        return;
                    }
                } catch (err) { }
            }

            // 2. Try ZXing
            if (typeof ZXingBrowser !== 'undefined') {
                const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
                try {
                    const result = await codeReader.decodeFromImageUrl(img.src);
                    manualBarcodeInput.value = result.text;
                    showToast('Código escaneado correctamente.');
                    e.target.value = '';
                    submitManualBarcode();
                    return;
                } catch (err) {
                    // 3. Fallback: Rotate 90 degrees if ZXing fails
                    canvas.width = img.height;
                    canvas.height = img.width;
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(90 * Math.PI / 180);
                    ctx.drawImage(img, -img.width / 2, -img.height / 2);
                    
                    const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    try {
                        const result2 = await codeReader.decodeFromImageUrl(rotatedDataUrl);
                        manualBarcodeInput.value = result2.text;
                        showToast('Código escaneado correctamente.');
                        e.target.value = '';
                        submitManualBarcode();
                        return;
                    } catch(err2) {
                        throw new Error("No barcode found by ZXing");
                    }
                }
            } else {
                throw new Error("ZXing not loaded");
            }
            
        } catch (err) {
            console.error("Error scanning file", err);
            showToast('No se detectó ningún código en la imagen.', 'error');
            e.target.value = '';
        }
    };

    if (nativeCameraInput) {
        nativeCameraInput.addEventListener('change', handleImageScan);
    }
    if (pcFileInput) {
        pcFileInput.addEventListener('change', handleImageScan);
    }

    document.getElementById('btnSubmitManualBarcode').addEventListener('click', submitManualBarcode);
    manualBarcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitManualBarcode();
    });

    // Close Modals buttons
    document.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // Signature Pad controls
    document.getElementById('clearSignatureBtn').addEventListener('click', () => {
        signaturePad.clear();
    });

    document.getElementById('saveSignatureBtn').addEventListener('click', confirmAction);

    // Extra Details Photo update name
    const actionPhoto = document.getElementById('actionPhoto');
    const actionPhotoName = document.getElementById('actionPhotoName');
    if (actionPhoto) {
        actionPhoto.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                actionPhotoName.textContent = "✓ Foto adjuntada";
                actionPhotoName.classList.remove('hidden');
            } else {
                actionPhotoName.classList.add('hidden');
            }
        });
    }

    // Context Menu global click (to close)
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    // Context Menu Actions
    document.getElementById('ctxViewDetails').addEventListener('click', () => {
        if (currentContextMenuSerial) showDetailsModal(currentContextMenuSerial);
        hideContextMenu();
    });

    document.getElementById('ctxCopySerial').addEventListener('click', () => {
        if (currentContextMenuSerial) {
            navigator.clipboard.writeText(currentContextMenuSerial);
            showToast('Número de serie copiado');
        }
        hideContextMenu();
    });
}

// --- Logic Flow ---

function startFlow(action, serial) {
    activeAction = action;
    activeSerialNumber = serial;

    // Reset forms
    if (document.getElementById('actionArticleName')) document.getElementById('actionArticleName').value = '';
    const articleNameContainer = document.getElementById('articleNameContainer');
    if (articleNameContainer) {
        articleNameContainer.style.display = action === 'receive' ? 'block' : 'none';
    }

    if (document.getElementById('actionEmployeeName')) document.getElementById('actionEmployeeName').value = '';
    if (document.getElementById('actionEmployeeDept')) document.getElementById('actionEmployeeDept').value = '';
    if (document.getElementById('actionObservations')) document.getElementById('actionObservations').value = '';
    if (document.getElementById('actionPhoto')) document.getElementById('actionPhoto').value = '';
    if (document.getElementById('actionPhotoName')) document.getElementById('actionPhotoName').classList.add('hidden');
    manualBarcodeInput.value = '';
    signaturePad.clear();

    const subtitle = document.getElementById('signatureSubtitle');
    const serialDisplay = document.getElementById('signatureSerialDisplay');
    
    if (subtitle) {
        subtitle.textContent = action === 'receive' ? 'Recepción de Nuevo Equipo' : 'Salida de Equipo';
    }
    
    if (serialDisplay && serial) {
        serialDisplay.innerHTML = `Número de Serie: <span class="font-mono font-bold text-brand-600">${serial}</span>`;
    }

    if (action === 'receive' && !serial) {
        openModal(barcodeModal);
        setTimeout(() => manualBarcodeInput.focus(), 50);
    } else {
        switchToSignatureModal(null);
    }
}

function switchToSignatureModal(fromModal) {
    if (fromModal) {
        closeModalAnim(fromModal);
        setTimeout(() => {
            openModal(signatureModal);
            setTimeout(() => {
                resizeCanvas();
                if (activeAction === 'receive') {
                    document.getElementById('actionArticleName').focus();
                } else {
                    document.getElementById('actionEmployeeName').focus();
                }
            }, 50);
        }, 300);
    } else {
        openModal(signatureModal);
        setTimeout(() => {
            resizeCanvas();
            if (activeAction === 'receive') {
                document.getElementById('actionArticleName').focus();
            } else {
                document.getElementById('actionEmployeeName').focus();
            }
        }, 50);
    }
}

function submitManualBarcode() {
    const val = manualBarcodeInput.value.trim();
    if (val) {
        activeSerialNumber = val;
        manualBarcodeInput.value = '';
        const subtitle = document.getElementById('signatureSubtitle');
        const serialDisplay = document.getElementById('signatureSerialDisplay');
        if (subtitle) {
            subtitle.textContent = 'Recepción de Equipo';
        }
        if (serialDisplay) {
            serialDisplay.innerHTML = `Número de Serie: <span class="font-mono font-bold text-brand-600">${activeSerialNumber}</span>`;
        }
        switchToSignatureModal(barcodeModal);
    } else {
        manualBarcodeInput.focus();
    }
}

async function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function confirmAction() {
    const articleInput = document.getElementById('actionArticleName');
    const articleName = articleInput && activeAction === 'receive' ? articleInput.value.trim() : null;

    if (activeAction === 'receive' && !articleName) {
        showToast('Por favor, ingresa el nombre del artículo', 'error');
        if (articleInput) articleInput.focus();
        return;
    }

    const nameInput = document.getElementById('actionEmployeeName');
    const employeeName = nameInput ? nameInput.value.trim() : '';
    const deptInput = document.getElementById('actionEmployeeDept');
    const employeeDept = deptInput ? deptInput.value.trim() : '';

    if (!employeeName) {
        showToast('Por favor, ingresa tu nombre completo', 'error');
        if (nameInput) nameInput.focus();
        return;
    }

    if (signaturePad.isEmpty()) {
        showToast('Por favor, proporciona una firma', 'error');
        return;
    }

    let photoData = null;
    const photoInput = document.getElementById('actionPhoto');
    if (photoInput && photoInput.files && photoInput.files.length > 0) {
        try {
            photoData = await getBase64(photoInput.files[0]);
        } catch (e) {
            console.error(e);
        }
    }

    const payload = {
        serial_number: activeSerialNumber,
        article_name: articleName,
        employee_name: employeeName,
        employee_department: employeeDept || 'General',
        signature_data: signaturePad.toDataURL(),
        observations: document.getElementById('actionObservations') ? document.getElementById('actionObservations').value : null,
        condition: document.getElementById('actionCondition') ? document.getElementById('actionCondition').value : null,
        photo_url: photoData
    };

    const endpoint = activeAction === 'receive' ? '/equipment/receive' : `/equipment/${activeSerialNumber}/dispatch`;

    try {
        const btn = document.getElementById('saveSignatureBtn');
        const originalText = btn.textContent;
        btn.textContent = 'Procesando...';
        btn.disabled = true;

        const res = await apiFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        btn.textContent = originalText;
        btn.disabled = false;

        if (res.ok) {
            showToast(`Equipo ${activeAction === 'receive' ? 'recibido' : 'despachado'} con éxito`);
            closeAllModals();
            fetchEquipments();
        } else {
            const data = await res.json();
            showToast(data.detail || 'Error al procesar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
        document.getElementById('saveSignatureBtn').disabled = false;
    }
}

// --- Data Fetching & Rendering ---

async function fetchEquipments() {
    try {
        const res = await apiFetch('/equipment');
        equipments = await res.json();
        renderTable();
    } catch (error) {
        document.getElementById('desktopEquipmentTableBody').innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error al cargar datos del servidor. Asegúrate de que FastAPI esté corriendo.</td></tr>`;
        document.getElementById('mobileEquipmentList').innerHTML = `<div class="p-4 text-center text-red-500">Error al cargar datos.</div>`;
    }
}

function renderTable() {
    const desktopTable = document.getElementById('desktopEquipmentTableBody');
    const mobileList = document.getElementById('mobileEquipmentList');

    if (metricTotal) metricTotal.textContent = equipments.length;
    if (metricReceived) metricReceived.textContent = equipments.filter(e => e.status === 'Recibido').length;
    if (metricDispatched) metricDispatched.textContent = equipments.filter(e => e.status === 'Despachado').length;

    let filtered = equipments;
    if (tableSearch && tableSearch.value.trim()) {
        const q = tableSearch.value.trim().toLowerCase();
        filtered = equipments.filter(e => 
            e.serial_number.toLowerCase().includes(q) || 
            (e.article_name && e.article_name.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        desktopTable.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 font-medium">No hay equipos registrados o que coincidan con la búsqueda.</td></tr>`;
        mobileList.innerHTML = `<div class="text-center py-12 text-gray-400 font-medium">No hay equipos.</div>`;
        return;
    }

    // Generate Desktop Rows
    desktopTable.innerHTML = filtered.map(eq => {
        const isReceived = eq.status === 'Recibido';
        const statusClass = isReceived ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20';

        const receiveHist = eq.history.find(h => h.action === 'Recepción');
        const dispatchHist = eq.history.find(h => h.action === 'Salida');

        const receptor = receiveHist ? `${receiveHist.employee.name} <br><span class="text-xs text-gray-400">${receiveHist.employee.department}</span>` : '-';
        const dispatcher = dispatchHist ? `${dispatchHist.employee.name} <br><span class="text-xs text-gray-400">${dispatchHist.employee.department}</span>` : '-';

        return `
            <tr class="group cursor-pointer border-b border-gray-50 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors" data-serial="${eq.serial_number}">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="font-bold text-gray-900 dark:text-white">${eq.serial_number}</div>
                    ${eq.article_name ? `<div class="text-sm text-gray-500 dark:text-gray-400">${eq.article_name}</div>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass}">
                        ${eq.status}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    ${receptor}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    ${dispatcher}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <div class="flex items-center justify-center gap-2">
                        ${isReceived ? `
                            <button onclick="startFlow('dispatch', '${eq.serial_number}')" class="inline-flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-white shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-brand-600 transition-colors">
                                Dar Salida
                            </button>
                        ` : `
                            <span class="inline-flex items-center text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-slate-700">Completado</span>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Generate Mobile Cards
    mobileList.innerHTML = filtered.map(eq => {
        const isReceived = eq.status === 'Recibido';
        const statusClass = isReceived ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20';

        const receiveHist = eq.history.find(h => h.action === 'Recepción');
        
        return `
            <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700/80 cursor-pointer active:scale-[0.98] transition-all" data-serial="${eq.serial_number}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Serie / Artículo</div>
                        <div class="font-bold text-lg text-gray-900 dark:text-white">${eq.serial_number}</div>
                        ${eq.article_name ? `<div class="text-sm text-gray-600 dark:text-gray-400">${eq.article_name}</div>` : ''}
                    </div>
                    <span class="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClass}">
                        ${eq.status}
                    </span>
                </div>
                
                <div class="text-sm text-gray-600 dark:text-gray-400 mb-4 bg-gray-50 dark:bg-slate-900/50 p-3 rounded-xl border border-gray-100 dark:border-slate-700">
                    <span class="font-medium text-gray-900 dark:text-white">Receptor:</span> ${receiveHist ? receiveHist.employee.name : '-'}
                </div>
                
                ${isReceived ? `
                    <button onclick="startFlow('dispatch', '${eq.serial_number}')" class="w-full inline-flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                        Dar Salida
                    </button>
                ` : `
                    <div class="w-full text-center text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-slate-700">Flujo Completado</div>
                `}
            </div>
        `;
    }).join('');

    // Attach Context Menu and Click listeners to new rows and cards
    document.querySelectorAll('#desktopEquipmentTableBody tr[data-serial], #mobileEquipmentList div[data-serial]').forEach(element => {
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const serial = element.getAttribute('data-serial');
            showContextMenu(e.pageX, e.pageY, serial);
        });
        element.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            const serial = element.getAttribute('data-serial');
            showDetailsModal(serial);
        });
    });
}

async function exportToExcel() {
    showToast('Generando archivo Excel con imágenes...', 'success');
    const btn = document.getElementById('btnExportExcel');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    
    try {
        const res = await apiFetch('/equipment/export');
        if (!res.ok) throw new Error("Error exporting");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `inventario_tecnocontrol_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        showToast('Error al exportar el documento', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

// --- Modals & UI Helpers ---

function openModal(modalElement) {
    modalOverlay.classList.remove('hidden');
    modalOverlay.classList.add('modal-active');
    modalElement.classList.remove('hidden');

    // Trigger reflow
    void modalOverlay.offsetWidth;

    modalOverlay.classList.add('modal-visible');
    setTimeout(() => {
        modalElement.classList.add('modal-visible', 'modal-scale-100');
        if (modalElement === authModal) {
            document.getElementById('empId').focus();
        }
    }, 10);
}

function closeModalAnim(modalElement) {
    modalElement.classList.remove('modal-visible', 'modal-scale-100');
    setTimeout(() => {
        modalElement.classList.add('hidden');
    }, 300);
}

function closeAllModals() {
    [barcodeModal, signatureModal, detailsModal, globalHistoryModal].forEach(m => {
        if (m && !m.classList.contains('hidden')) {
            m.classList.remove('modal-visible', 'modal-scale-100');
            setTimeout(() => { m.classList.add('hidden'); }, 300);
        }
    });

    modalOverlay.classList.remove('modal-visible');
    setTimeout(() => {
        modalOverlay.classList.remove('modal-active');
        modalOverlay.classList.add('hidden');
    }, 300);
}

// --- Context Menu ---

function showContextMenu(x, y, serial) {
    currentContextMenuSerial = serial;
    contextMenu.classList.remove('hidden');

    // Adjust position so it doesn't go off screen
    const menuWidth = 224; // w-56
    const menuHeight = contextMenu.offsetHeight;

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    // Animate in
    void contextMenu.offsetWidth;
    contextMenu.classList.add('modal-visible', 'modal-scale-100');
}

function hideContextMenu() {
    contextMenu.classList.remove('modal-visible', 'modal-scale-100');
    setTimeout(() => {
        contextMenu.classList.add('hidden');
    }, 150);
}



// --- Global History Modal ---

async function showGlobalHistoryModal() {
    openModal(globalHistoryModal);
    const timeline = document.getElementById('globalHistoryTimeline');
    timeline.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400 pl-4">Cargando historial global...</div>';

    try {
        const res = await apiFetch('/history');
        if (!res.ok) throw new Error('Not found');
        const historyData = await res.json();
        
        if(historyData.length === 0) {
            timeline.innerHTML = '<div class="text-sm text-gray-500 pl-4">No hay movimientos registrados.</div>';
            return;
        }

        setTimeout(() => {
            timeline.innerHTML = historyData.map((c, index) => {
                const eq = c.equipment;
                const eqInfo = `<span class="font-bold text-gray-900 dark:text-white">${eq.serial_number}</span> <span class="text-gray-500 dark:text-gray-400 font-normal">${eq.article_name ? ` • ${eq.article_name}` : ''}</span>`;
                const dispatch = c.start_event;
                const receive = c.end_event;
                
                const isCompleted = c.status === "Completado";
                const dotColor = isCompleted ? 'border-emerald-400' : 'border-amber-400';
                
                const dDate = new Date(dispatch.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                const rDate = receive ? new Date(receive.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Pendiente';

                return `
                <div class="relative pl-8 group">
                    <!-- Timeline Dot -->
                    <div class="absolute left-[-9px] top-6 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 ${dotColor} shadow-sm transition-transform"></div>
                    
                    <div class="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/60 transition-all hover:border-brand-200 dark:hover:border-slate-600 overflow-hidden">
                        
                        <!-- Clickable Summary -->
                        <div class="p-5 cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.chevron-icon').classList.toggle('rotate-180')">
                            <!-- Header -->
                            <div class="flex items-center justify-between mb-4">
                                <div class="flex items-center gap-3">
                                    <h4 class="text-sm">
                                        ${eqInfo}
                                    </h4>
                                    <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${isCompleted ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'}">
                                        ${c.status}
                                    </span>
                                </div>
                                <svg class="chevron-icon w-5 h-5 text-gray-400 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                            
                            <!-- Minimal Grid with Photos -->
                            <div class="flex flex-col sm:flex-row gap-4 sm:gap-10 relative">
                                
                                <!-- Start Event -->
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-1">
                                        <div class="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                                        <span class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Préstamo</span>
                                    </div>
                                    <div class="text-sm font-medium text-gray-800 dark:text-gray-200">${dispatch.employee.name} <span class="text-xs text-gray-400 dark:text-gray-500 font-normal">(${dispatch.employee.department})</span></div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">${dDate}</div>
                                    ${dispatch.photo_url ? `<img src="${dispatch.photo_url}" class="h-14 w-auto object-contain rounded border border-gray-100 dark:border-slate-700 bg-white" alt="Foto">` : ''}
                                </div>

                                <!-- Connector Line for Desktop -->
                                <div class="hidden sm:block absolute left-1/2 top-2 bottom-2 w-px bg-gray-100 dark:bg-slate-700/50 -translate-x-1/2"></div>
                                
                                <!-- End Event -->
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-1">
                                        <div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                        <span class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Devolución</span>
                                    </div>
                                    ${receive ? `
                                        <div class="text-sm font-medium text-gray-800 dark:text-gray-200">${receive.employee.name} <span class="text-xs text-gray-400 dark:text-gray-500 font-normal">(${receive.employee.department})</span></div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">${rDate}</div>
                                        ${receive.photo_url ? `<img src="${receive.photo_url}" class="h-14 w-auto object-contain rounded border border-gray-100 dark:border-slate-700 bg-white" alt="Foto">` : ''}
                                    ` : `
                                        <div class="text-sm font-medium text-amber-500 italic mt-1">Aún en uso...</div>
                                    `}
                                </div>
                            </div>
                        </div>

                        <!-- Expandable Details -->
                        <div class="hidden border-t border-gray-100 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-900/30 p-5">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                                <div>
                                    ${dispatch.condition ? `<div class="text-sm text-gray-600 dark:text-gray-400 mb-2"><strong class="text-gray-800 dark:text-gray-200">Estado al salir:</strong> ${dispatch.condition}</div>` : ''}
                                    ${dispatch.observations ? `<div class="text-sm text-gray-600 dark:text-gray-400 mb-3 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700 italic">"${dispatch.observations}"</div>` : ''}
                                    ${dispatch.signature_data ? `
                                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Firma de Salida</span>
                                        <img src="${dispatch.signature_data}" class="h-12 w-auto object-contain rounded bg-white border border-gray-100 dark:border-slate-700">
                                    ` : ''}
                                </div>
                                <div>
                                    ${receive ? `
                                        ${receive.condition ? `<div class="text-sm text-gray-600 dark:text-gray-400 mb-2"><strong class="text-gray-800 dark:text-gray-200">Estado al volver:</strong> ${receive.condition}</div>` : ''}
                                        ${receive.observations ? `<div class="text-sm text-gray-600 dark:text-gray-400 mb-3 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700 italic">"${receive.observations}"</div>` : ''}
                                        ${receive.signature_data ? `
                                            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Firma de Devolución</span>
                                            <img src="${receive.signature_data}" class="h-12 w-auto object-contain rounded bg-white border border-gray-100 dark:border-slate-700">
                                        ` : ''}
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            }).join('');
        }, 300);

    } catch (error) {
        timeline.innerHTML = '<div class="text-sm text-red-500 pl-4">Error al cargar historial global.</div>';
    }
}

// --- Toast ---

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');

    const colors = type === 'success'
        ? 'bg-gray-900 text-white'
        : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20';

    const icon = type === 'success'
        ? `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
        : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg toast-enter font-medium text-sm ${colors}`;
    toast.innerHTML = `${icon} <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(1rem)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
