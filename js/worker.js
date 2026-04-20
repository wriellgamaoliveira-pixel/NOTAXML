/**
 * NotaXML - Web Worker para processamento de XMLs
 * Processa arquivos em segundo plano sem travar a UI
 */

// Importar biblioteca de descompactacao
importScripts('https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js');

/**
 * Converte string para numero (formato BR ou US)
 */
function toNum(value) {
  if (value === null || value === undefined) return 0;
  let str = String(value).trim();
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  const num = Number(str);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Extrai valor de tag XML
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
 * Extrai bloco XML
 */
function extractBlock(xmlText, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xmlText.match(regex);
  return match ? match[0] : '';
}

/**
 * Extrai todos os blocos de uma tag
 */
function extractAllBlocks(xmlText, tagName) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?</${tagName}>`, 'gi');
  const blocks = [];
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

/**
 * Gera ID unico
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Detecta modulo fiscal baseado no XML
 */
function detectModule(xmlText) {
  if (xmlText.includes('<mod>55</mod>') || xmlText.includes('<NFe')) return 'nfe';
  if (xmlText.includes('<mod>65</mod>') || xmlText.includes('<NFCe')) return 'nfce';
  if (xmlText.includes('<NFSe') || xmlText.includes('<tcCompNfse') || xmlText.includes('<NFS-e')) return 'nfse';
  if (xmlText.includes('<NFCom') || xmlText.includes('<nfcom')) return 'nfcom';
  return 'nfe';
}

/**
 * Parser generico para NFe/NFCe
 */
function parseNFeNFCe(xmlText, fileName, forceModule = null) {
  const id = generateId();
  const modulo = forceModule || detectModule(xmlText);

  // Extrair blocos principais
  const emitBlock = extractBlock(xmlText, 'emit');
  const destBlock = extractBlock(xmlText, 'dest');
  const totalBlock = extractBlock(xmlText, 'total');
  const ideBlock = extractBlock(xmlText, 'ide');

  // Dados da nota
  const nota = {
    id,
    fileName,
    modulo,
    // Identificacao
    nNF: extractTagAny(xmlText, ['nNF', 'nnf']),
    cNF: extractTagAny(xmlText, ['cNF', 'cnf']),
    serie: extractTag(ideBlock, 'serie'),
    natOp: extractTag(ideBlock, 'natOp'),
    mod: extractTag(ideBlock, 'mod'),
    tpNF: extractTag(ideBlock, 'tpNF'),
    // Datas
    dhEmi: extractTagAny(xmlText, ['dhEmi', 'dEmi']),
    dhSaiEnt: extractTagAny(xmlText, ['dhSaiEnt', 'dSaiEnt']),
    // Emitente
    emitente: extractTag(emitBlock, 'xNome'),
    emitCNPJ: extractTagAny(emitBlock, ['CNPJ', 'CPF']),
    emitIE: extractTag(emitBlock, 'IE'),
    emitUF: extractTag(emitBlock, 'UF'),
    // Destinatario
    destinatario: extractTag(destBlock, 'xNome'),
    destCNPJ: extractTagAny(destBlock, ['CNPJ', 'CPF']),
    destIE: extractTag(destBlock, 'IE'),
    destUF: extractTag(destBlock, 'UF'),
    // Valores totais
    vNF: toNum(extractTagAny(totalBlock, ['vNF', 'vNf'])),
    vProd: toNum(extractTag(totalBlock, 'vProd')),
    vFrete: toNum(extractTag(totalBlock, 'vFrete')),
    vSeg: toNum(extractTag(totalBlock, 'vSeg')),
    vDesc: toNum(extractTag(totalBlock, 'vDesc')),
    vOutro: toNum(extractTag(totalBlock, 'vOutro')),
    vBC: toNum(extractTag(totalBlock, 'vBC')),
    vICMS: toNum(extractTag(totalBlock, 'vICMS')),
    vICMSDeson: toNum(extractTag(totalBlock, 'vICMSDeson')),
    vFCPUFDest: toNum(extractTag(totalBlock, 'vFCPUFDest')),
    vICMSUFDest: toNum(extractTag(totalBlock, 'vICMSUFDest')),
    vICMSUFRemet: toNum(extractTag(totalBlock, 'vICMSUFRemet')),
    vFCP: toNum(extractTag(totalBlock, 'vFCP')),
    vBCST: toNum(extractTag(totalBlock, 'vBCST')),
    vST: toNum(extractTag(totalBlock, 'vST')),
    vFCPST: toNum(extractTag(totalBlock, 'vFCPST')),
    vFCPSTRet: toNum(extractTag(totalBlock, 'vFCPSTRet')),
    vIPI: toNum(extractTag(totalBlock, 'vIPI')),
    vIPIDevol: toNum(extractTag(totalBlock, 'vIPIDevol')),
    vPIS: toNum(extractTag(totalBlock, 'vPIS')),
    vCOFINS: toNum(extractTag(totalBlock, 'vCOFINS')),
    // Retencoes
    vRetTribTot: toNum(extractTag(xmlText, 'vRetTribTot')),
    vRetPIS: toNum(extractTagAny(xmlText, ['vRetPIS', 'vPISRet'])),
    vRetCOFINS: toNum(extractTagAny(xmlText, ['vRetCOFINS', 'vCOFINSRet'])),
    vRetCSLL: toNum(extractTagAny(xmlText, ['vRetCSLL', 'vCSLLRet'])),
    vIRRF: toNum(extractTagAny(xmlText, ['vIRRF', 'vIrrf'])),
    // Campos agregados (preenchidos depois)
    cst: '',
    cfop: '',
    cClass: ''
  };

  // Extrair itens (det)
  const detBlocks = extractAllBlocks(xmlText, 'det');
  const itens = [];
  let mainCst = '';
  let mainCfop = '';
  let mainCClass = '';

  detBlocks.forEach((detXml, index) => {
    const itemId = `${id}_item_${index}`;
    const prodBlock = extractBlock(detXml, 'prod');
    const impostoBlock = extractBlock(detXml, 'imposto');
    const icmsBlock = extractBlock(impostoBlock, 'ICMS');

    // Detectar CST/CSOSN
    let cst = extractTag(icmsBlock, 'CST');
    const csosn = extractTag(icmsBlock, 'CSOSN');
    if (csosn) {
      cst = `SN${csosn}`;
    } else if (cst) {
      cst = `${cst}`;
    }

    const cfop = extractTag(prodBlock, 'CFOP');
    const cClass = extractTag(prodBlock, 'cClass') || extractTag(detXml, 'cClass') || cfop;

    // Guardar primeiro CST/CFOP como principal da nota
    if (!mainCst && cst) mainCst = cst;
    if (!mainCfop && cfop) mainCfop = cfop;
    if (!mainCClass && cClass) mainCClass = cClass;

    const item = {
      id: itemId,
      notaId: id,
      modulo,
      nItem: extractTag(detXml, 'nItem') || (index + 1),
      // Produto
      cProd: extractTag(prodBlock, 'cProd'),
      cEAN: extractTag(prodBlock, 'cEAN'),
      xProd: extractTag(prodBlock, 'xProd'),
      NCM: extractTag(prodBlock, 'NCM'),
      CEST: extractTag(prodBlock, 'CEST'),
      CFOP: cfop,
      uCom: extractTag(prodBlock, 'uCom'),
      qCom: toNum(extractTag(prodBlock, 'qCom')),
      vUnCom: toNum(extractTag(prodBlock, 'vUnCom')),
      vProd: toNum(extractTag(prodBlock, 'vProd')),
      cEANTrib: extractTag(prodBlock, 'cEANTrib'),
      uTrib: extractTag(prodBlock, 'uTrib'),
      qTrib: toNum(extractTag(prodBlock, 'qTrib')),
      vUnTrib: toNum(extractTag(prodBlock, 'vUnTrib')),
      vFrete: toNum(extractTag(prodBlock, 'vFrete')),
      vSeg: toNum(extractTag(prodBlock, 'vSeg')),
      vDesc: toNum(extractTag(prodBlock, 'vDesc')),
      vOutro: toNum(extractTag(prodBlock, 'vOutro')),
      indTot: extractTag(prodBlock, 'indTot'),
      // Impostos
      cst,
      csosn: csosn || '',
      cClass,
      ncm: extractTag(prodBlock, 'NCM'),
      // ICMS
      orig: extractTag(icmsBlock, 'orig'),
      modBC: extractTag(icmsBlock, 'modBC'),
      vBC: toNum(extractTag(icmsBlock, 'vBC')),
      pICMS: toNum(extractTag(icmsBlock, 'pICMS')),
      vICMS: toNum(extractTag(icmsBlock, 'vICMS')),
      pRedBC: toNum(extractTag(icmsBlock, 'pRedBC')),
      vBCST: toNum(extractTag(icmsBlock, 'vBCST')),
      pICMSST: toNum(extractTag(icmsBlock, 'pICMSST')),
      vICMSST: toNum(extractTag(icmsBlock, 'vICMSST')),
      // PIS
      vPIS: toNum(extractTag(impostoBlock, 'vPIS')),
      pPIS: toNum(extractTag(impostoBlock, 'pPIS')),
      vBCPIS: toNum(extractTag(impostoBlock, 'vBC')),
      // COFINS
      vCOFINS: toNum(extractTag(impostoBlock, 'vCOFINS')),
      pCOFINS: toNum(extractTag(impostoBlock, 'pCOFINS')),
      vBCCOFINS: toNum(extractTag(impostoBlock, 'vBC')),
      // IPI
      vIPI: toNum(extractTag(impostoBlock, 'vIPI')),
      pIPI: toNum(extractTag(impostoBlock, 'pIPI'))
    };

    itens.push(item);
  });

  // Atualizar nota com CST/CFOP principal
  nota.cst = mainCst;
  nota.cfop = mainCfop;
  nota.cClass = mainCClass;

  return { nota, itens };
}

/**
 * Parser para NFS-e
 */
function parseNFSe(xmlText, fileName) {
  const id = generateId();
  const modulo = 'nfse';

  // Extrair dados principais
  const nota = {
    id,
    fileName,
    modulo,
    nNF: extractTagAny(xmlText, ['Numero', 'numero', 'NumeroNfse', 'InfNfse']),
    cNF: extractTag(xmlText, 'CodigoVerificacao'),
    serie: extractTag(xmlText, 'Serie'),
    dhEmi: extractTagAny(xmlText, ['DataEmissao', 'dhEmi', 'dEmi']),
    // Prestador
    emitente: extractTagAny(xmlText, ['RazaoSocial', 'xNome', 'NomeFantasia']),
    emitCNPJ: extractTagAny(xmlText, ['Cnpj', 'CNPJ', 'CpfCnpj']),
    emitIE: extractTag(xmlText, 'InscricaoMunicipal'),
    emitUF: '',
    // Tomador
    destinatario: extractTagAny(xmlText, ['RazaoSocialTomador', 'RazaoSocial', 'NomeTomador']),
    destCNPJ: '',
    destIE: '',
    destUF: '',
    // Valores
    vNF: toNum(extractTagAny(xmlText, ['ValorServicos', 'ValorLiquidoNfse', 'vNF'])),
    vProd: toNum(extractTag(xmlText, 'ValorServicos')),
    vDesc: toNum(extractTagAny(xmlText, ['DescontoIncondicionado', 'vDesc'])),
    vBC: toNum(extractTag(xmlText, 'BaseCalculo')),
    vICMS: 0,
    vPIS: toNum(extractTag(xmlText, 'ValorPis')),
    vCOFINS: toNum(extractTag(xmlText, 'ValorCofins')),
    vIR: toNum(extractTag(xmlText, 'ValorIr')),
    vINSS: toNum(extractTag(xmlText, 'ValorInss')),
    vCSLL: toNum(extractTag(xmlText, 'ValorCsll')),
    vISS: toNum(extractTagAny(xmlText, ['ValorIss', 'ValorIssRetido'])),
    aliqISS: toNum(extractTag(xmlText, 'Aliquota')),
    vRetTribTot: toNum(extractTag(xmlText, 'ValorTotalTributos')),
    // Servico
    itemLista: extractTagAny(xmlText, ['ItemListaServico', 'CodigoItemListaServico']),
    cnae: extractTag(xmlText, 'CodigoCnae'),
    descricao: extractTagAny(xmlText, ['Discriminacao', 'DescricaoServico']),
    cst: '',
    cfop: '',
    cClass: extractTagAny(xmlText, ['ItemListaServico', 'CodigoItemListaServico'])
  };

  // NFS-e geralmente nao tem itens separados
  const itens = [{
    id: `${id}_item_0`,
    notaId: id,
    modulo,
    nItem: 1,
    xProd: nota.descricao,
    vProd: nota.vNF,
    cst: '',
    cfop: '',
    cClass: nota.itemLista,
    ncm: '',
    vISS: nota.vISS,
    aliqISS: nota.aliqISS
  }];

  return { nota, itens };
}

/**
 * Parser para NFCom
 */
function parseNFCom(xmlText, fileName) {
  const id = generateId();
  const modulo = 'nfcom';

  const emitBlock = extractBlock(xmlText, 'emit');
  const destBlock = extractBlock(xmlText, 'dest');
  const totalBlock = extractBlock(xmlText, 'total');

  const nota = {
    id,
    fileName,
    modulo,
    nNF: extractTagAny(xmlText, ['nNF', 'nnf']),
    cNF: extractTagAny(xmlText, ['cNF', 'cnf']),
    serie: extractTag(xmlText, 'serie'),
    dhEmi: extractTagAny(xmlText, ['dhEmi', 'dEmi']),
    emitente: extractTag(emitBlock, 'xNome'),
    emitCNPJ: extractTag(emitBlock, 'CNPJ'),
    emitIE: extractTag(emitBlock, 'IE'),
    emitUF: extractTag(emitBlock, 'UF'),
    destinatario: extractTag(destBlock, 'xNome'),
    destCNPJ: extractTagAny(destBlock, ['CNPJ', 'CPF']),
    destIE: extractTag(destBlock, 'IE'),
    destUF: extractTag(destBlock, 'UF'),
    vNF: toNum(extractTagAny(totalBlock, ['vNF', 'vProd'])),
    vProd: toNum(extractTag(totalBlock, 'vProd')),
    vDesc: toNum(extractTag(totalBlock, 'vDesc')),
    vBC: toNum(extractTag(totalBlock, 'vBC')),
    vICMS: toNum(extractTag(totalBlock, 'vICMS')),
    vPIS: toNum(extractTag(totalBlock, 'vPIS')),
    vCOFINS: toNum(extractTag(totalBlock, 'vCOFINS')),
    vRetTribTot: 0,
    cst: '',
    cfop: '',
    cClass: ''
  };

  // Extrair detalhes (det)
  const detBlocks = extractAllBlocks(xmlText, 'det');
  const itens = [];

  detBlocks.forEach((detXml, index) => {
    const itemId = `${id}_item_${index}`;
    const prodBlock = extractBlock(detXml, 'prod');
    const cClass = extractTag(prodBlock, 'cClass') || extractTag(detXml, 'cClass');
    const cfop = extractTag(prodBlock, 'CFOP');

    if (!nota.cClass && cClass) nota.cClass = cClass;
    if (!nota.cfop && cfop) nota.cfop = cfop;

    itens.push({
      id: itemId,
      notaId: id,
      modulo,
      nItem: index + 1,
      xProd: extractTag(prodBlock, 'xProd'),
      vProd: toNum(extractTag(prodBlock, 'vProd')),
      cClass,
      cfop,
      cst: '',
      ncm: ''
    });
  });

  return { nota, itens };
}

/**
 * Processa um arquivo XML
 */
function processXML(xmlText, fileName, forceModule) {
  const detectedModule = detectModule(xmlText);
  const module = forceModule || detectedModule;

  switch (module) {
    case 'nfse':
      return parseNFSe(xmlText, fileName);
    case 'nfcom':
      return parseNFCom(xmlText, fileName);
    case 'nfe':
    case 'nfce':
    default:
      return parseNFeNFCe(xmlText, fileName, module);
  }
}

/**
 * Envia progresso para a thread principal
 */
function postProgress(stage, percent, processed, total) {
  self.postMessage({
    type: 'progress',
    stage,
    percent,
    processed,
    total
  });
}

/**
 * Envia lote de dados para a thread principal
 */
function postBatch(notas, itens, xmls) {
  self.postMessage({
    type: 'batch',
    notas,
    itens,
    xmls
  });
}

/**
 * Handler de mensagens
 */
self.onmessage = async (event) => {
  try {
    const { zipBuffer, module } = event.data || {};

    if (!zipBuffer) {
      throw new Error('ZIP invalido');
    }

    postProgress('Descompactando ZIP...', 2, 0, 0);

    // Descompactar ZIP
    const zipData = new Uint8Array(zipBuffer);
    const unzipped = fflate.unzipSync(zipData);

    postProgress('Listando XMLs...', 5, 0, 0);

    // Filtrar apenas arquivos XML
    const xmlFiles = Object.keys(unzipped).filter(name => 
      name.toLowerCase().endsWith('.xml') && !name.startsWith('__MACOSX')
    );

    const total = xmlFiles.length;
    if (total === 0) {
      throw new Error('Nenhum arquivo XML encontrado no ZIP');
    }

    postProgress('Processando XMLs...', 10, 0, total);

    // Processar em lotes para nao sobrecarregar
    const BATCH_SIZE = 100;
    let processed = 0;
    let currentNotas = [];
    let currentItens = [];
    let currentXmls = [];

    for (const fileName of xmlFiles) {
      const xmlText = new TextDecoder().decode(unzipped[fileName]);

      // Processar XML
      const result = processXML(xmlText, fileName, module);

      if (result.nota) {
        currentNotas.push(result.nota);
        currentItens.push(...result.itens);
        currentXmls.push({
          id: generateId(),
          notaId: result.nota.id,
          fileName,
          content: xmlText
        });
      }

      processed++;

      // Enviar lote quando atingir o tamanho
      if (currentNotas.length >= BATCH_SIZE) {
        postBatch(currentNotas, currentItens, currentXmls);
        currentNotas = [];
        currentItens = [];
        currentXmls = [];
      }

      // Atualizar progresso a cada 50 arquivos
      if (processed % 50 === 0 || processed === total) {
        const percent = Math.round(10 + (processed / total) * 85);
        postProgress('Processando XMLs...', percent, processed, total);
      }
    }

    // Enviar lote final
    if (currentNotas.length > 0) {
      postBatch(currentNotas, currentItens, currentXmls);
    }

    postProgress('Finalizando...', 98, total, total);

    // Notificar conclusao
    self.postMessage({
      type: 'done',
      total
    });

  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message || String(error)
    });
  }
};
