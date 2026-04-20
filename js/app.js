/**
 * NotaXML - Aplicacao principal
 */

// Estado da aplicacao
const AppState = {
  currentModule: 'nfe',
  isProcessing: false
};

/**
 * Inicializa a aplicacao
 */
async function initApp() {
  console.log('Inicializando NotaXML...');

  // Inicializar banco de dados
  await NotaDB.init();

  // Carregar modulo salvo
  const savedModule = await NotaDB.getMetadata('currentModule');
  if (savedModule) {
    AppState.currentModule = savedModule;
    const moduleSelect = document.getElementById('moduleSelect');
    if (moduleSelect) moduleSelect.value = savedModule;
  }

  // Configurar event listeners
  setupEventListeners();

  // Carregar estatisticas
  await loadStats();

  // Carregar notas recentes
  await loadRecentNotes();

  // Inicializar icones Lucide
  if (window.lucide) lucide.createIcons();

  console.log('NotaXML inicializado com sucesso!');
}

/**
 * Configura event listeners
 */
function setupEventListeners() {
  // Seletor de modulo
  const moduleSelect = document.getElementById('moduleSelect');
  if (moduleSelect) {
    moduleSelect.addEventListener('change', async (e) => {
      AppState.currentModule = e.target.value;
      await NotaDB.setMetadata('currentModule', e.target.value);
      await loadStats();
      await loadRecentNotes();
      NotaUtils.showToast(`Modulo alterado para ${e.target.value.toUpperCase()}`, 'success');
    });
  }

  // Zona de upload
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');

  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileUpload(files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileUpload(e.target.files);
      }
    });
  }

  // Botao limpar banco
  const btnClearDb = document.getElementById('btnClearDb');
  if (btnClearDb) {
    btnClearDb.addEventListener('click', async () => {
      const confirmed = await NotaUtils.confirmAction(
        'Tem certeza que deseja limpar todos os dados? Esta acao nao pode ser desfeita.',
        'Limpar Banco de Dados'
      );
      if (confirmed) {
        await NotaDB.clearDatabase();
        await loadStats();
        await loadRecentNotes();
        NotaUtils.showToast('Banco de dados limpo com sucesso!', 'success');
      }
    });
  }

  // Botao exportar dados
  const btnExportDb = document.getElementById('btnExportDb');
  if (btnExportDb) {
    btnExportDb.addEventListener('click', async () => {
      await exportAllData();
    });
  }
}

/**
 * Carrega estatisticas do dashboard
 */
async function loadStats() {
  try {
    const totals = await NotaDB.getTotals(AppState.currentModule);
    const storage = await NotaDB.estimateStorageSize();

    const statTotalNotas = document.getElementById('statTotalNotas');
    const statValorTotal = document.getElementById('statValorTotal');
    const statTotalIcms = document.getElementById('statTotalIcms');
    const statStorage = document.getElementById('statStorage');

    if (statTotalNotas) statTotalNotas.textContent = NotaUtils.formatNumber(totals.count);
    if (statValorTotal) statValorTotal.textContent = NotaUtils.formatBRL(totals.vNF);
    if (statTotalIcms) statTotalIcms.textContent = NotaUtils.formatBRL(totals.vICMS);
    if (statStorage) statStorage.textContent = storage.usageMB + ' MB';

    const dbStatus = document.getElementById('dbStatus');
    if (dbStatus) {
      dbStatus.textContent = `${NotaUtils.formatNumber(totals.count)} notas`;
    }
  } catch (error) {
    console.error('Erro ao carregar estatisticas:', error);
  }
}

/**
 * Carrega notas recentes na tabela
 */
async function loadRecentNotes() {
  try {
    const notas = await NotaDB.getNotas({
      modulo: AppState.currentModule,
      limit: 10,
      orderBy: 'dhEmi',
      orderDir: 'desc'
    });

    const tbody = document.getElementById('recentNotesBody');
    if (!tbody) return;

    if (notas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted">
            Nenhuma nota importada ainda
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = notas.map(nota => `
      <tr>
        <td>${nota.nNF || '-'}</td>
        <td>${(nota.emitente || '-').substring(0, 30)}${(nota.emitente || '').length > 30 ? '...' : ''}</td>
        <td>${(nota.destinatario || '-').substring(0, 30)}${(nota.destinatario || '').length > 30 ? '...' : ''}</td>
        <td>${NotaUtils.formatDate(nota.dhEmi)}</td>
        <td class="text-right">${NotaUtils.formatBRL(nota.vNF)}</td>
        <td><span class="pill">${nota.modulo.toUpperCase()}</span></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar notas recentes:', error);
  }
}

/**
 * Processa upload de arquivos ZIP
 */
async function handleFileUpload(files) {
  if (AppState.isProcessing) {
    NotaUtils.showToast('Ja existe um processamento em andamento', 'error');
    return;
  }

  AppState.isProcessing = true;
  const progressSection = document.getElementById('progressSection');
  if (progressSection) progressSection.style.display = 'block';

  updateProgress('Iniciando...', 0, 0, 0);

  try {
    // Criar worker para processamento
    const worker = new Worker('js/worker.js');

    worker.onmessage = async (event) => {
      const msg = event.data;

      if (msg.type === 'progress') {
        updateProgress(msg.stage, msg.percent, msg.processed, msg.total);
      }

      if (msg.type === 'batch') {
        // Salvar lote de notas no banco
        if (msg.notas && msg.notas.length > 0) {
          await NotaDB.addNotasBatch(msg.notas);
        }
        if (msg.itens && msg.itens.length > 0) {
          await NotaDB.addItensBatch(msg.itens);
        }
        if (msg.xmls && msg.xmls.length > 0) {
          await NotaDB.addXMLsBatch(msg.xmls);
        }
      }

      if (msg.type === 'done') {
        updateProgress('Concluido!', 100, msg.total, msg.total);
        await loadStats();
        await loadRecentNotes();
        NotaUtils.showToast(`${msg.total} arquivos XML processados com sucesso!`, 'success');
        AppState.isProcessing = false;
        worker.terminate();

        // Esconder progresso apos 3 segundos
        setTimeout(() => {
          if (progressSection) progressSection.style.display = 'none';
        }, 3000);
      }

      if (msg.type === 'error') {
        NotaUtils.showToast('Erro: ' + msg.error, 'error');
        AppState.isProcessing = false;
        worker.terminate();
      }
    };

    worker.onerror = (error) => {
      console.error('Erro no worker:', error);
      NotaUtils.showToast('Erro ao processar arquivos', 'error');
      AppState.isProcessing = false;
    };

    // Processar cada arquivo
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      worker.postMessage({
        zipBuffer: buffer,
        module: AppState.currentModule
      }, [buffer]);
    }
  } catch (error) {
    console.error('Erro no upload:', error);
    NotaUtils.showToast('Erro ao processar arquivos: ' + error.message, 'error');
    AppState.isProcessing = false;
  }
}

/**
 * Atualiza barra de progresso
 */
function updateProgress(stage, percent, processed, total) {
  const progressStage = document.getElementById('progressStage');
  const progressPercent = document.getElementById('progressPercent');
  const progressFill = document.getElementById('progressFill');
  const progressProcessed = document.getElementById('progressProcessed');
  const progressTotal = document.getElementById('progressTotal');

  if (progressStage) progressStage.textContent = stage;
  if (progressPercent) progressPercent.textContent = percent + '%';
  if (progressFill) progressFill.style.width = percent + '%';
  if (progressProcessed) progressProcessed.textContent = NotaUtils.formatNumber(processed);
  if (progressTotal) progressTotal.textContent = NotaUtils.formatNumber(total);
}

/**
 * Exporta todos os dados para CSV
 */
async function exportAllData() {
  try {
    NotaUtils.showToast('Preparando exportacao...', 'info');

    const notas = await NotaDB.getNotas({
      modulo: AppState.currentModule,
      limit: 999999
    });

    if (notas.length === 0) {
      NotaUtils.showToast('Nenhuma nota para exportar', 'error');
      return;
    }

    const columns = [
      { key: 'nNF', label: 'Numero NF' },
      { key: 'emitente', label: 'Emitente' },
      { key: 'destinatario', label: 'Destinatario' },
      { key: 'dhEmi', label: 'Emissao', format: 'date' },
      { key: 'vNF', label: 'Valor NF', format: 'currency' },
      { key: 'vICMS', label: 'ICMS', format: 'currency' },
      { key: 'vPIS', label: 'PIS', format: 'currency' },
      { key: 'vCOFINS', label: 'COFINS', format: 'currency' },
      { key: 'cst', label: 'CST' },
      { key: 'cfop', label: 'CFOP' },
      { key: 'modulo', label: 'Modulo' }
    ];

    const filename = `notaxml_export_${AppState.currentModule}_${new Date().toISOString().split('T')[0]}.csv`;
    NotaUtils.exportToCSV(notas, filename, columns);

    NotaUtils.showToast('Exportacao concluida!', 'success');
  } catch (error) {
    console.error('Erro na exportacao:', error);
    NotaUtils.showToast('Erro ao exportar dados', 'error');
  }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', initApp);
