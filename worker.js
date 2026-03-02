// worker.js (classic) - robusto e com valores corretos
// - Unzip: fflate
// - Parsing: regex por item <det> (evita duplicidade dos totais)
// - Conversão numérica: aceita "1234.56" e "1.234,56"

importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");

function toNum(v) {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();

  // Se tiver vírgula, assume BR: 1.234,56
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Se não tiver vírgula, assume US: 1234.56 (não remove ponto!)
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function firstTag(text, tag) {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`);
  const m = text.match(re);
  return m ? String(m[1]).trim() : "";
}

function postStage(stage, message, percent, processed, total) {
  self.postMessage({ type: "stage", stage, message, percent, processed, total });
}
function postProgress(stage, processed, total) {
  const percent = total ? Math.round((processed / total) * 100) : 100;
  self.postMessage({ type: "progress", stage, percent, processed, total });
}

function getCSTICMS_fromDet(detXml) {
  const csosn = firstTag(detXml, "CSOSN");
  if (csosn) return `CSOSN ${csosn}`;
  const cst = firstTag(detXml, "CST");
  if (cst) return `CST ${cst}`;
  return "CST 000";
}

function getCFOP_fromDet(detXml) {
  return firstTag(detXml, "CFOP") || "0000";
}

function sumDetValues(detXml) {
  // tenta pegar por item:
  const vProd = toNum(firstTag(detXml, "vProd")) || 0;
  const vICMS = toNum(firstTag(detXml, "vICMS")) || 0;
  const vPIS = toNum(firstTag(detXml, "vPIS")) || 0;
  const vCOFINS = toNum(firstTag(detXml, "vCOFINS")) || 0;

  return { vProd, vICMS, vPIS, vCOFINS };
}

function getDetBlocks(xmlText) {
  const dets = [];
  const re = /<det\b[^>]*>([\s\S]*?)<\/det>/g;
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    dets.push(m[0]); // bloco inteiro
  }
  return dets;
}

function fallbackTotals(xmlText) {
  // fallback (quando não tem <det>): tenta total do documento
  // OBS: isso é fallback, o padrão é por <det>
  const vProd = toNum(firstTag(xmlText, "vProd"));
  const vICMS = toNum(firstTag(xmlText, "vICMS"));
  const vPIS = toNum(firstTag(xmlText, "vPIS"));
  const vCOFINS = toNum(firstTag(xmlText, "vCOFINS"));
  return { vProd, vICMS, vPIS, vCOFINS };
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

    const resumo = {
      total_xml: 0,
      total_valor_itens: 0,
      por_cst_cfop: {},
      impostos: { ICMS: 0, PIS: 0, COFINS: 0 }
    };

    postStage("parse", "Processando XMLs...", 8, 0, total);

    let processed = 0;

    for (const name of names) {
      const xmlText = new TextDecoder().decode(unzipped[name]);

      const dets = getDetBlocks(xmlText);

      if (dets.length > 0) {
        // soma por item (mais fiel)
        for (const det of dets) {
          const { vProd, vICMS, vPIS, vCOFINS } = sumDetValues(det);

          resumo.total_valor_itens += vProd;
          resumo.impostos.ICMS += vICMS;
          resumo.impostos.PIS += vPIS;
          resumo.impostos.COFINS += vCOFINS;

          const cst = getCSTICMS_fromDet(det);
          const cfop = getCFOP_fromDet(det);
          const key = `${cst}__${cfop}`;

          if (!resumo.por_cst_cfop[key]) {
            resumo.por_cst_cfop[key] = { cst, cfop, qtd_xml: 0, valor_itens: 0 };
          }
          // qtd_xml aqui significa “qtd de itens” para esse CST+CFOP
          resumo.por_cst_cfop[key].qtd_xml += 1;
          resumo.por_cst_cfop[key].valor_itens += vProd;
        }
      } else {
        // fallback se não tiver itens
        const { vProd, vICMS, vPIS, vCOFINS } = fallbackTotals(xmlText);

        resumo.total_valor_itens += vProd;
        resumo.impostos.ICMS += vICMS;
        resumo.impostos.PIS += vPIS;
        resumo.impostos.COFINS += vCOFINS;

        const cst = "CST 000";
        const cfop = firstTag(xmlText, "CFOP") || "0000";
        const key = `${cst}__${cfop}`;
        if (!resumo.por_cst_cfop[key]) {
          resumo.por_cst_cfop[key] = { cst, cfop, qtd_xml: 0, valor_itens: 0 };
        }
        resumo.por_cst_cfop[key].qtd_xml += 1;
        resumo.por_cst_cfop[key].valor_itens += vProd;
      }

      resumo.total_xml += 1;
      processed += 1;

      // sempre manda progresso (ZIP pequeno também)
      postProgress("parse", processed, total);
    }

    self.postMessage({ type: "done", result: resumo, total });
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
};
