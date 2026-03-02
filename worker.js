// worker.js (classic) - CORRIGIDO (sem DOMParser)
// ZIP: fflate | XML parse: fast-xml-parser (funciona em Web Worker)

importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");
importScripts("https://cdn.jsdelivr.net/npm/fast-xml-parser@4.4.1/dist/fxp.min.js");

const { XMLParser } = fxp;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,          // remove ns:Tag -> Tag (ajuda muito)
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

function toNum(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function asArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

// Busca profunda: soma todos os valores de uma tag (ex: vICMS, vPIS, vCOFINS, vProd)
function sumAllByKey(obj, key) {
  let sum = 0;

  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    for (const k of Object.keys(cur)) {
      const val = cur[k];
      if (k === key) {
        if (Array.isArray(val)) sum += val.reduce((a, b) => a + toNum(b), 0);
        else sum += toNum(val);
      } else if (val && typeof val === "object") {
        stack.push(val);
      }
    }
  }
  return sum;
}

// Tenta achar CFOP em vários pontos
function getCFOP(json) {
  // procurar primeira ocorrência de "CFOP"
  let found = "";

  const stack = [json];
  while (stack.length && !found) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (k === "CFOP" || k === "cfop") {
        found = String(v ?? "").trim();
        break;
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return found || "0000";
}

// Tenta achar CST/CSOSN do ICMS
function getCSTICMS(json) {
  // procurar por CSOSN primeiro
  let csosn = "";
  let cst = "";

  const stack = [json];
  while (stack.length && !(csosn || cst)) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    for (const k of Object.keys(cur)) {
      const v = cur[k];

      if (!csosn && k === "CSOSN") csosn = String(v ?? "").trim();
      if (!cst && k === "CST") cst = String(v ?? "").trim();

      if (v && typeof v === "object") stack.push(v);
    }
  }

  if (csosn) return `CSOSN ${csosn}`;
  if (cst) return `CST ${cst}`;
  return "CST 000";
}

self.onmessage = async (event) => {
  try {
    const { zipBuffer } = event.data || {};
    if (!zipBuffer) throw new Error("ZIP inválido.");

    const zipData = new Uint8Array(zipBuffer);
    const unzipped = fflate.unzipSync(zipData);

    const names = Object.keys(unzipped).filter(n => n.toLowerCase().endsWith(".xml"));
    const total = names.length;

    const resumo = {
      total_xml: 0,
      total_valor_itens: 0,
      por_cst_cfop: {},
      impostos: { ICMS: 0, PIS: 0, COFINS: 0 }
    };

    let processed = 0;

    for (const name of names) {
      const xmlText = new TextDecoder().decode(unzipped[name]);

      // parse XML no worker
      const json = parser.parse(xmlText);

      // somatórios (busca profunda)
      const vProd = sumAllByKey(json, "vProd");
      const vICMS = sumAllByKey(json, "vICMS");
      const vPIS = sumAllByKey(json, "vPIS");
      const vCOFINS = sumAllByKey(json, "vCOFINS");

      resumo.total_valor_itens += vProd;
      resumo.impostos.ICMS += vICMS;
      resumo.impostos.PIS += vPIS;
      resumo.impostos.COFINS += vCOFINS;

      const cst = getCSTICMS(json);
      const cfop = getCFOP(json);
      const key = `${cst}__${cfop}`;

      if (!resumo.por_cst_cfop[key]) {
        resumo.por_cst_cfop[key] = { cst, cfop, qtd_xml: 0, valor_itens: 0 };
      }
      resumo.por_cst_cfop[key].qtd_xml += 1;
      resumo.por_cst_cfop[key].valor_itens += vProd;

      resumo.total_xml += 1;
      processed += 1;

      if (processed % 50 === 0 || processed === total) {
        const percent = total ? Math.round((processed / total) * 100) : 100;
        self.postMessage({ type: "progress", percent, processed, total });
      }
    }

    self.postMessage({ type: "done", result: resumo });
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
};
