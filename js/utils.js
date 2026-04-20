/**
 * NotaXML - Utilitarios gerais
 */

/**
 * Formata valor como moeda BRL
 */
function formatBRL(value) {
  const num = parseFloat(value) || 0;
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/**
 * Formata numero com separador de milhares
 */
function formatNumber(value, decimals = 0) {
  const num = parseFloat(value) || 0;
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Formata data ISO para formato brasileiro
 */
function formatDate(isoDate) {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) {
    // Tenta parsear formato YYYY-MM-DD
    const parts = isoDate.split(/[-T]/);
    if (parts.length >= 3) {
      return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
    }
    return isoDate;
  }
  return date.toLocaleDateString('pt-BR');
}

/**
 * Formata tamanho em bytes para MB
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Gera um ID unico
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Converte string para numero (formato BR ou US)
 */
function toNumber(value) {
  if (value === null || value === undefined) return 0;
  let str = String(value).trim();
  // Formato BR: 1.234,56
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  const num = Number(str);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Extrai valor de tag XML usando regex
 */
function extractTag(xmlText, tagName) {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
  const match = xmlText.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Extrai valor de multiplas tags possiveis
 */
function extractTagAny(xmlText, tagNames) {
  for (const tag of tagNames) {
    const value = extractTag(xmlText, tag);
    if (value) return value;
  }
  return '';
}

/**
 * Extrai todos os blocos de uma tag
 */
function extractAllBlocks(xmlText, tagName) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi');
  const blocks = [];
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

/**
 * Detecta o modulo fiscal baseado no XML
 */
function detectModule(xmlText) {
  // NFe modelo 55
  if (xmlText.includes('<mod>55</mod>') || xmlText.includes('<NFe')) {
    return 'nfe';
  }
  // NFCe modelo 65
  if (xmlText.includes('<mod>65</mod>') || xmlText.includes('<NFCe')) {
    return 'nfce';
  }
  // NFSe
  if (xmlText.includes('<NFSe') || xmlText.includes('<tcCompNfse') || xmlText.includes('<NFS-e')) {
    return 'nfse';
  }
  // NFCom
  if (xmlText.includes('<NFCom') || xmlText.includes('<nfcom')) {
    return 'nfcom';
  }
  // Default
  return 'nfe';
}

/**
 * Debounce para funcoes chamadas frequentemente
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle para funcoes chamadas frequentemente
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Exporta dados para CSV
 */
function exportToCSV(data, filename, columns) {
  const BOM = '\uFEFF';
  const separator = ';';

  const headers = columns.map(c => c.label).join(separator);
  const rows = data.map(row => {
    return columns.map(c => {
      let value = row[c.key];
      if (c.format === 'currency') {
        value = formatBRL(value);
      } else if (c.format === 'number') {
        value = formatNumber(value, c.decimals || 2);
      } else if (c.format === 'date') {
        value = formatDate(value);
      }
      // Escapar aspas e envolver em aspas se necessario
      if (typeof value === 'string' && (value.includes(separator) || value.includes('"') || value.includes('\n'))) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      return value !== undefined && value !== null ? value : '';
    }).join(separator);
  });

  const csv = BOM + headers + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Cria elemento HTML com atributos
 */
function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'innerHTML') {
      element.innerHTML = value;
    } else if (key === 'textContent') {
      element.textContent = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  });
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  });
  return element;
}

/**
 * Mostra notificacao toast
 */
function showToast(message, type = 'info', duration = 3000) {
  const toast = createElement('div', {
    className: `toast toast-${type}`,
    innerHTML: `
      <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}"></i>
      <span>${message}</span>
    `
  });

  // Estilo inline para o toast
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 20px',
    background: type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#2563eb',
    color: 'white',
    borderRadius: '10px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    zIndex: '9999',
    animation: 'slideIn 0.3s ease',
    fontSize: '14px',
    fontWeight: '500'
  });

  document.body.appendChild(toast);
  if (window.lucide) lucide.createIcons({ icons: toast.querySelectorAll('[data-lucide]') });

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Confirma acao com modal
 */
function confirmAction(message, title = 'Confirmar') {
  return new Promise((resolve) => {
    const overlay = createElement('div', { className: 'modal-overlay' });
    const modal = createElement('div', {
      className: 'modal',
      innerHTML: `
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" data-action="cancel">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body">
          <p>${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-action="cancel">Cancelar</button>
          <button class="btn btn-danger" data-action="confirm">Confirmar</button>
        </div>
      `
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons({ icons: modal.querySelectorAll('[data-lucide]') });

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        cleanup(btn.dataset.action === 'confirm');
      });
    });
  });
}

/**
 * Paginacao virtual para grandes listas
 */
class VirtualPagination {
  constructor(options) {
    this.container = options.container;
    this.itemsPerPage = options.itemsPerPage || 50;
    this.currentPage = 1;
    this.totalItems = 0;
    this.data = [];
    this.renderItem = options.renderItem;
    this.onPageChange = options.onPageChange;
  }

  setData(data) {
    this.data = data;
    this.totalItems = data.length;
    this.currentPage = 1;
    this.render();
  }

  getTotalPages() {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  getCurrentPageData() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.data.slice(start, end);
  }

  goToPage(page) {
    const totalPages = this.getTotalPages();
    if (page < 1 || page > totalPages) return;
    this.currentPage = page;
    this.render();
    if (this.onPageChange) this.onPageChange(page);
  }

  render() {
    if (!this.container) return;

    const pageData = this.getCurrentPageData();
    const totalPages = this.getTotalPages();

    // Renderizar itens
    const itemsHtml = pageData.map(item => this.renderItem(item)).join('');

    // Renderizar paginacao
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div class="pagination">
          <button ${this.currentPage === 1 ? 'disabled' : ''} data-page="1">
            <i data-lucide="chevrons-left"></i>
          </button>
          <button ${this.currentPage === 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">
            <i data-lucide="chevron-left"></i>
          </button>
          <span class="pagination-info">
            Pagina ${this.currentPage} de ${totalPages} (${formatNumber(this.totalItems)} itens)
          </span>
          <button ${this.currentPage === totalPages ? 'disabled' : ''} data-page="${this.currentPage + 1}">
            <i data-lucide="chevron-right"></i>
          </button>
          <button ${this.currentPage === totalPages ? 'disabled' : ''} data-page="${totalPages}">
            <i data-lucide="chevrons-right"></i>
          </button>
        </div>
      `;
    }

    this.container.innerHTML = itemsHtml + paginationHtml;

    // Event listeners para paginacao
    this.container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.goToPage(parseInt(btn.dataset.page));
      });
    });

    if (window.lucide) lucide.createIcons();
  }
}

// Adicionar CSS para animacoes de toast
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Exportar para uso global
window.NotaUtils = {
  formatBRL,
  formatNumber,
  formatDate,
  formatBytes,
  generateId,
  toNumber,
  extractTag,
  extractTagAny,
  extractAllBlocks,
  detectModule,
  debounce,
  throttle,
  exportToCSV,
  createElement,
  showToast,
  confirmAction,
  VirtualPagination
};
