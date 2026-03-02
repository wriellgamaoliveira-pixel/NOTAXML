// worker.js (classic) - com notas + retenções (vRetTribTot)
// unzip: fflate | parse: regex

importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");

function toNum(v) {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  // BR: 1.234,56
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  // US: 1234.56 (não remove ponto)
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function firstTag(text, tag) {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`);
  const m = text.match(re);
  return m ? String(m[1]).trim() : "";
}

function firstTagAny(text, tags) {
  for (const t of tags) {
    const v = firstTag(text, t);
    if (v) return v;
  }
  return "";
}

function getDetBlocks(xmlText) {
  const dets = [];
  const re = /<det\b[^>]*>([\s\S]*?)<\/det>/g;
  let m;
  while ((m = re.exec(xmlText)) !== null) dets.push(m[0]);
  return dets;
}

function getCST_fromDet(detXml) {
  // Simples: CSOSN; Normal: CST
  const csosn = firstTag(detXml, "CSOSN");
  if (csosn) return `ICMSSN${csosn}`; // exibe parecido com “ICMS40/ICMSSNxxx”
  const cst = firstTag(detXml, "CST");
  if (cst) return `ICMS${cst}`;
  return "ICMS00";
}

function getCFOP_fromDet(detXml) {
  return firstTag(detXml, "CFOP") || "0000";
}

function getDetValues(detXml) {
  // Por item
  const vProd = toNum(firstTag(detXml, "vProd"));
  const vICMS = toNum(firstTag(detXml, "vICMS"));
  const vPIS = toNum(firstTag(detXml, "vPIS"));
  const vCOFINS = toNum(firstTag(detXml, "vCOFINS"));
  return { vProd, vICMS, vPIS, vCOFINS };
}

function postStage(stage, message, percent, processed, total) {
  self.postMessage({ type: "stage", stage, message, percent, processed, total });
}
function postProgress(stage, processed, total) {
  const percent = total ? Math.round((processed / total) * 100) : 100;
  self.postMessage({ type: "progress", stage, percent, processed, total });
}

self.onmessage = async (event) => {
  try {
    const { zipBuffer } = event.data || {};
    if (!zipBuffer) throw new Error("ZIP inválido.");

    postStage("unzip", "Descompactando ZIP...", 2, 0, "-");
    const zipData = new Uint8Array(zipBuffer);
    const unzipped = fflate.unzipSync(zipData);

    postStage("scan", "Listando XMLs...", 5, 0, "-");
    const names = Object.keys(unzipped).filter(n => n.toLowerCase().endsWith(".xml"));
    const total = names.length;
    if (!total) throw new Error("Nenhum arquivo .xml encontrado dentro do ZIP.");

    const result = {
      total_xml: 0,
      // tabela CST+CFOP
      cst_cfop: {}, // key -> {cst, cfop, qtd_itens, valor_total, icms, pis, cofins, notas:[]}
      // retenções
      retencoes: {
        total_retido: 0,        // vRetTribTot somado
        por_tipo: {}            // tipo -> {tipo, qtd_notas, valor_total, notas:[]}
      }
    };

    postStage("parse", "Processando XMLs...", 8, 0, total);

    let processed = 0;

    for (const name of names) {
      const xmlText = new TextDecoder().decode(unzipped[name]);

      // Dados da nota (para expandir)
      const nNF = firstTagAny(xmlText, ["nNF", "nnf"]);
      const cNF = firstTagAny(xmlText, ["cNF", "cnf"]);
      const emitente = firstTagAny(xmlText, ["emit", "Emit"]) ? firstTagAny(xmlText, ["xNome"]) : ""; // fallback
      // Melhor: pega primeiro xNome e o segundo xNome pode ser dest; mas em XML varia
      // Vamos puxar direto pelos blocos <emit> e <dest> se existirem:
      const emitBlock = xmlText.match(/<emit>[\s\S]*?<\/emit>/)?.[0] || "";
      const destBlock = xmlText.match(/<dest>[\s\S]*?<\/dest>/)?.[0] || "";
      const emitNome = firstTag(emitBlock, "xNome") || firstTag(xmlText, "xNome") || "";
      const destNome = firstTag(destBlock, "xNome") || "";

      const dhEmi = firstTagAny(xmlText, ["dhEmi", "dEmi"]);
      const vNF = toNum(firstTagAny(xmlText, ["vNF", "vNf", "vnf"]));

      const notaInfo = {
        nNF: nNF || "-",
        cNF: cNF || "-",
        emitente: emitNome || "-",
        destinatario: destNome || "-",
        emissao: dhEmi ? String(dhEmi).slice(0, 10) : "-",
        valor: vNF
      };

      // --- CST+CFOP por item ---
      const dets = getDetBlocks(xmlText);

      for (const det of dets) {
        const cst = getCST_fromDet(det);
        const cfop = getCFOP_fromDet(det);
        const { vProd, vICMS, vPIS, vCOFINS } = getDetValues(det);

        const key = `${cst}__${cfop}`;
        if (!result.cst_cfop[key]) {
          result.cst_cfop[key] = {
            cst, cfop,
            qtd_itens: 0,
            valor_total: 0,
            icms: 0, pis: 0, cofins: 0,
            notas: []
          };
        }

        const row = result.cst_cfop[key];
        row.qtd_itens += 1;
        row.valor_total += vProd;
        row.icms += vICMS;
        row.pis += vPIS;
        row.cofins += vCOFINS;

        // adiciona nota uma vez por grupo (não por item)
        const idNota = `${notaInfo.nNF}__${notaInfo.cNF}`;
        if (!row._seen) row._seen = new Set();
        if (!row._seen.has(idNota)) {
          row._seen.add(idNota);
          row.notas.push(notaInfo);
        }
      }

      // --- Retenções (vRetTribTot + IRRF/PIS/COFINS/CSLL retidos) ---
      const vRetTribTot = toNum(firstTag(xmlText, "vRetTribTot"));
      if (vRetTribTot) result.retencoes.total_retido += vRetTribTot;

      const vRetPIS = toNum(firstTagAny(xmlText, ["vRetPIS", "vPISRet", "vRetPis"]));
      const vRetCOFINS = toNum(firstTagAny(xmlText, ["vRetCOFINS", "vCOFINSRet", "vRetCofins"]));
      const vRetCSLL = toNum(firstTagAny(xmlText, ["vRetCSLL", "vCSLLRet", "vRetCsll"]));
      const vIRRF = toNum(firstTagAny(xmlText, ["vIRRF", "vIrrf"]));

      const retMap = [
        { tipo: "PIS Retido", valor: vRetPIS, campo: "pis" },
        { tipo: "COFINS Retido", valor: vRetCOFINS, campo: "cofins" },
        { tipo: "CSLL Retido", valor: vRetCSLL, campo: "csll" },
        { tipo: "IRRF Retido", valor: vIRRF, campo: "irrf" },
      ].filter(x => x.valor > 0);

      for (const r of retMap) {
        if (!result.retencoes.por_tipo[r.tipo]) {
          result.retencoes.por_tipo[r.tipo] = {
            tipo: r.tipo,
            qtd_notas: 0,
            valor_total: 0,
            notas: []
          };
        }

        const g = result.retencoes.por_tipo[r.tipo];
        g.valor_total += r.valor;

        // adiciona nota + valores por tipo
        const idNota = `${notaInfo.nNF}__${notaInfo.cNF}`;
        if (!g._seen) g._seen = new Set();
        if (!g._seen.has(idNota)) {
          g._seen.add(idNota);
          g.qtd_notas += 1;
          g.notas.push({
            ...notaInfo,
            pis_ret: vRetPIS,
            cofins_ret: vRetCOFINS,
            csll_ret: vRetCSLL,
            irrf_ret: vIRRF,
            total_retido: vRetTribTot || (vRetPIS + vRetCOFINS + vRetCSLL + vIRRF)
          });
        }
      }

      result.total_xml += 1;
      processed += 1;
      postProgress("parse", processed, total);
    }

    // limpa sets internos
    for (const k of Object.keys(result.cst_cfop)) delete result.cst_cfop[k]._seen;
    for (const k of Object.keys(result.retencoes.por_tipo)) delete result.retencoes.por_tipo[k]._seen;

    self.postMessage({ type: "done", result, total });
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
};
