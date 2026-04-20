/**
 * NotaXML - Modulo de Banco de Dados IndexedDB
 * Suporte a mais de 50.000 notas fiscais
 */

const DB_NAME = 'NotaXMLDatabase';
const DB_VERSION = 1;

// Stores do banco
const STORES = {
  NOTAS: 'notas',
  ITENS: 'itens',
  METADATA: 'metadata',
  XML_RAW: 'xmlRaw'
};

let db = null;

/**
 * Inicializa o banco de dados IndexedDB
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Erro ao abrir IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('IndexedDB inicializado com sucesso');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Store de notas fiscais
      if (!database.objectStoreNames.contains(STORES.NOTAS)) {
        const notasStore = database.createObjectStore(STORES.NOTAS, { keyPath: 'id' });
        notasStore.createIndex('modulo', 'modulo', { unique: false });
        notasStore.createIndex('nNF', 'nNF', { unique: false });
        notasStore.createIndex('emitente', 'emitente', { unique: false });
        notasStore.createIndex('destinatario', 'destinatario', { unique: false });
        notasStore.createIndex('dhEmi', 'dhEmi', { unique: false });
        notasStore.createIndex('cst', 'cst', { unique: false });
        notasStore.createIndex('cfop', 'cfop', { unique: false });
        notasStore.createIndex('cClass', 'cClass', { unique: false });
        notasStore.createIndex('modulo_cst', ['modulo', 'cst'], { unique: false });
        notasStore.createIndex('modulo_cfop', ['modulo', 'cfop'], { unique: false });
        notasStore.createIndex('modulo_cClass', ['modulo', 'cClass'], { unique: false });
      }

      // Store de itens (detalhes por item da nota)
      if (!database.objectStoreNames.contains(STORES.ITENS)) {
        const itensStore = database.createObjectStore(STORES.ITENS, { keyPath: 'id' });
        itensStore.createIndex('notaId', 'notaId', { unique: false });
        itensStore.createIndex('modulo', 'modulo', { unique: false });
        itensStore.createIndex('cst', 'cst', { unique: false });
        itensStore.createIndex('cfop', 'cfop', { unique: false });
        itensStore.createIndex('ncm', 'ncm', { unique: false });
        itensStore.createIndex('cClass', 'cClass', { unique: false });
      }

      // Store de metadados (estatisticas, configuracoes)
      if (!database.objectStoreNames.contains(STORES.METADATA)) {
        database.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      }

      // Store de XMLs originais (para alteracao em lote)
      if (!database.objectStoreNames.contains(STORES.XML_RAW)) {
        const xmlStore = database.createObjectStore(STORES.XML_RAW, { keyPath: 'id' });
        xmlStore.createIndex('notaId', 'notaId', { unique: false });
      }

      console.log('Stores do IndexedDB criados');
    };
  });
}

/**
 * Obtem uma transacao do banco
 */
function getTransaction(storeNames, mode = 'readonly') {
  if (!db) throw new Error('Banco de dados nao inicializado');
  return db.transaction(storeNames, mode);
}

/**
 * Adiciona uma nota ao banco
 */
async function addNota(nota) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS], 'readwrite');
    const store = tx.objectStore(STORES.NOTAS);
    const request = store.put(nota);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Adiciona multiplas notas em lote (otimizado para grandes volumes)
 */
async function addNotasBatch(notas, onProgress) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS], 'readwrite');
    const store = tx.objectStore(STORES.NOTAS);
    let processed = 0;
    const total = notas.length;

    notas.forEach((nota, index) => {
      const request = store.put(nota);
      request.onsuccess = () => {
        processed++;
        if (onProgress && processed % 100 === 0) {
          onProgress(processed, total);
        }
      };
      request.onerror = () => {
        console.error('Erro ao inserir nota:', request.error);
      };
    });

    tx.oncomplete = () => {
      if (onProgress) onProgress(total, total);
      resolve(total);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Adiciona itens em lote
 */
async function addItensBatch(itens, onProgress) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.ITENS], 'readwrite');
    const store = tx.objectStore(STORES.ITENS);
    let processed = 0;
    const total = itens.length;

    itens.forEach((item) => {
      const request = store.put(item);
      request.onsuccess = () => {
        processed++;
        if (onProgress && processed % 500 === 0) {
          onProgress(processed, total);
        }
      };
    });

    tx.oncomplete = () => {
      if (onProgress) onProgress(total, total);
      resolve(total);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Adiciona XMLs em lote
 */
async function addXMLsBatch(xmls) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.XML_RAW], 'readwrite');
    const store = tx.objectStore(STORES.XML_RAW);

    xmls.forEach((xml) => {
      store.put(xml);
    });

    tx.oncomplete = () => resolve(xmls.length);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Obtem todas as notas (com paginacao)
 */
async function getNotas(options = {}) {
  await initDB();
  const { modulo, limit = 100, offset = 0, orderBy = 'dhEmi', orderDir = 'desc' } = options;

  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS], 'readonly');
    const store = tx.objectStore(STORES.NOTAS);
    const results = [];

    let request;
    if (modulo) {
      const index = store.index('modulo');
      request = index.openCursor(IDBKeyRange.only(modulo));
    } else {
      request = store.openCursor();
    }

    let count = 0;
    let skipped = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && count < limit) {
        if (skipped < offset) {
          skipped++;
          cursor.continue();
        } else {
          results.push(cursor.value);
          count++;
          cursor.continue();
        }
      } else {
        // Ordenar resultados
        results.sort((a, b) => {
          const aVal = a[orderBy] || '';
          const bVal = b[orderBy] || '';
          if (orderDir === 'desc') {
            return bVal.localeCompare ? bVal.localeCompare(aVal) : bVal - aVal;
          }
          return aVal.localeCompare ? aVal.localeCompare(bVal) : aVal - bVal;
        });
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Conta total de notas
 */
async function countNotas(modulo = null) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS], 'readonly');
    const store = tx.objectStore(STORES.NOTAS);

    let request;
    if (modulo) {
      const index = store.index('modulo');
      request = index.count(IDBKeyRange.only(modulo));
    } else {
      request = store.count();
    }

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Obtem estatisticas agregadas por campo
 */
async function getAggregate(options = {}) {
  await initDB();
  const { modulo, groupBy, sumFields = ['vNF', 'vICMS', 'vPIS', 'vCOFINS'] } = options;

  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS], 'readonly');
    const store = tx.objectStore(STORES.NOTAS);
    const aggregates = {};

    let request;
    if (modulo) {
      const index = store.index('modulo');
      request = index.openCursor(IDBKeyRange.only(modulo));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const nota = cursor.value;
        const key = nota[groupBy] || 'Outros';

        if (!aggregates[key]) {
          aggregates[key] = {
            [groupBy]: key,
            count: 0,
            notas: []
          };
          sumFields.forEach(f => aggregates[key][f] = 0);
        }

        aggregates[key].count++;
        sumFields.forEach(f => {
          aggregates[key][f] += parseFloat(nota[f]) || 0;
        });

        // Guardar referencia das notas (limitado para performance)
        if (aggregates[key].notas.length < 100) {
          aggregates[key].notas.push({
            id: nota.id,
            nNF: nota.nNF,
            emitente: nota.emitente,
            destinatario: nota.destinatario,
            dhEmi: nota.dhEmi,
            vNF: nota.vNF
          });
        }

        cursor.continue();
      } else {
        resolve(Object.values(aggregates));
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Obtem estatisticas agregadas de itens
 */
async function getItensAggregate(options = {}) {
  await initDB();
  const { modulo, groupBy, sumFields = ['vProd', 'vICMS', 'vPIS', 'vCOFINS'] } = options;

  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.ITENS], 'readonly');
    const store = tx.objectStore(STORES.ITENS);
    const aggregates = {};

    let request;
    if (modulo) {
      const index = store.index('modulo');
      request = index.openCursor(IDBKeyRange.only(modulo));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        const key = item[groupBy] || 'Outros';

        if (!aggregates[key]) {
          aggregates[key] = {
            [groupBy]: key,
            count: 0,
            itens: []
          };
          sumFields.forEach(f => aggregates[key][f] = 0);
        }

        aggregates[key].count++;
        sumFields.forEach(f => {
          aggregates[key][f] += parseFloat(item[f]) || 0;
        });

        cursor.continue();
      } else {
        resolve(Object.values(aggregates));
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Obtem totais gerais
 */
async function getTotals(modulo = null) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS], 'readonly');
    const store = tx.objectStore(STORES.NOTAS);

    const totals = {
      count: 0,
      vNF: 0,
      vICMS: 0,
      vPIS: 0,
      vCOFINS: 0,
      vRetTribTot: 0
    };

    let request;
    if (modulo) {
      const index = store.index('modulo');
      request = index.openCursor(IDBKeyRange.only(modulo));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const nota = cursor.value;
        totals.count++;
        totals.vNF += parseFloat(nota.vNF) || 0;
        totals.vICMS += parseFloat(nota.vICMS) || 0;
        totals.vPIS += parseFloat(nota.vPIS) || 0;
        totals.vCOFINS += parseFloat(nota.vCOFINS) || 0;
        totals.vRetTribTot += parseFloat(nota.vRetTribTot) || 0;
        cursor.continue();
      } else {
        resolve(totals);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Obtem XML original por ID da nota
 */
async function getXMLByNotaId(notaId) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.XML_RAW], 'readonly');
    const store = tx.objectStore(STORES.XML_RAW);
    const index = store.index('notaId');
    const request = index.get(notaId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Obtem todos os XMLs
 */
async function getAllXMLs(modulo = null) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.XML_RAW, STORES.NOTAS], 'readonly');
    const xmlStore = tx.objectStore(STORES.XML_RAW);
    const notasStore = tx.objectStore(STORES.NOTAS);
    const results = [];

    const request = xmlStore.openCursor();

    request.onsuccess = async (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const xml = cursor.value;
        // Se filtrar por modulo, verificar a nota correspondente
        if (modulo) {
          const notaReq = notasStore.get(xml.notaId);
          notaReq.onsuccess = () => {
            if (notaReq.result && notaReq.result.modulo === modulo) {
              results.push(xml);
            }
          };
        } else {
          results.push(xml);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Limpa todo o banco de dados
 */
async function clearDatabase() {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS, STORES.ITENS, STORES.METADATA, STORES.XML_RAW], 'readwrite');

    tx.objectStore(STORES.NOTAS).clear();
    tx.objectStore(STORES.ITENS).clear();
    tx.objectStore(STORES.METADATA).clear();
    tx.objectStore(STORES.XML_RAW).clear();

    tx.oncomplete = () => {
      console.log('Banco de dados limpo');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Estima o tamanho do banco em bytes
 */
async function estimateStorageSize() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      usageMB: ((estimate.usage || 0) / 1024 / 1024).toFixed(2),
      quotaMB: ((estimate.quota || 0) / 1024 / 1024).toFixed(2)
    };
  }
  return { usage: 0, quota: 0, usageMB: '0', quotaMB: '0' };
}

/**
 * Salva metadados
 */
async function setMetadata(key, value) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.METADATA], 'readwrite');
    const store = tx.objectStore(STORES.METADATA);
    const request = store.put({ key, value, updatedAt: new Date().toISOString() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Obtem metadados
 */
async function getMetadata(key) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.METADATA], 'readonly');
    const store = tx.objectStore(STORES.METADATA);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Busca notas por termo
 */
async function searchNotas(term, options = {}) {
  await initDB();
  const { modulo, limit = 50 } = options;
  const termLower = term.toLowerCase();

  return new Promise((resolve, reject) => {
    const tx = getTransaction([STORES.NOTAS], 'readonly');
    const store = tx.objectStore(STORES.NOTAS);
    const results = [];

    let request;
    if (modulo) {
      const index = store.index('modulo');
      request = index.openCursor(IDBKeyRange.only(modulo));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        const nota = cursor.value;
        const searchStr = [
          nota.nNF,
          nota.emitente,
          nota.destinatario,
          nota.cst,
          nota.cfop,
          nota.cClass
        ].join(' ').toLowerCase();

        if (searchStr.includes(termLower)) {
          results.push(nota);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// Exportar funcoes para uso global
window.NotaDB = {
  init: initDB,
  addNota,
  addNotasBatch,
  addItensBatch,
  addXMLsBatch,
  getNotas,
  countNotas,
  getAggregate,
  getItensAggregate,
  getTotals,
  getXMLByNotaId,
  getAllXMLs,
  clearDatabase,
  estimateStorageSize,
  setMetadata,
  getMetadata,
  searchNotas,
  STORES
};
